import { randomBytes } from "node:crypto";
import { type Database, type TenantCalendar, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export interface GoogleCalendarOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Agenda sans les tokens — seule forme qui sort par l'API admin. */
export type SafeCalendar = Omit<TenantCalendar, "accessToken" | "refreshToken">;

export interface CalendarBusyEvent {
  /** Id de l'event Google. */
  id: string;
  summary: string | null;
  start: Date;
  end: Date;
  /** `updated` de l'event (curseur de sync). */
  updated: Date;
}

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
/** Durée de validité d'un state OAuth en attente (anti-CSRF). */
const STATE_TTL_MS = 10 * 60_000;

/**
 * Agendas Google Calendar par tenant (OAuth 2.0, REST brut — même pattern que
 * GoogleBusinessService). Import des créneaux occupés (lecture seule) pour
 * éviter les doubles réservations.
 *
 * v1 : on connecte l'agenda `primary`. Le choix d'un agenda précis + l'export
 * des réservations OKITO vers Google viendront ensuite.
 */
export class GoogleCalendarService {
  private readonly pendingStates = new Map<string, { tenantId: string; expiresAt: number }>();

  constructor(
    private readonly db: Database,
    private readonly oauth: GoogleCalendarOAuthConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  buildAuthUrl(tenantId: string): { url: string; state: string } {
    this.prunePendingStates();
    const state = randomBytes(24).toString("hex");
    this.pendingStates.set(state, { tenantId, expiresAt: Date.now() + STATE_TTL_MS });

    const params = new URLSearchParams({
      client_id: this.oauth.clientId,
      redirect_uri: this.oauth.redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return { url: `${AUTH_ENDPOINT}?${params}`, state };
  }

  /** Callback OAuth : échange le code, résout l'agenda primary, crée la connexion. */
  async handleCallback(code: string, state: string, now = new Date()): Promise<SafeCalendar> {
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new BadRequestError("State OAuth inconnu ou expiré", "oauth_state_invalid");
    }

    const tokens = await this.exchangeCode(code);
    const primary = await this.fetchPrimaryCalendar(tokens.accessToken);

    const [row] = await this.db
      .insert(schema.tenantCalendars)
      .values({
        tenantId: pending.tenantId,
        calendarId: primary.id,
        calendarSummary: primary.summary,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.expiresAt,
        eventsCursor: now,
      })
      .onConflictDoUpdate({
        target: [schema.tenantCalendars.tenantId, schema.tenantCalendars.calendarId],
        set: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessTokenExpiresAt: tokens.expiresAt,
          status: "active",
          lastError: null,
        },
      })
      .returning();
    if (!row) throw new Error("insert tenant_calendars failed");
    logger.info(
      { tenantId: pending.tenantId, calendar: primary.summary },
      "Agenda Google connecté",
    );
    return toSafe(row);
  }

  /** Access token valide — renouvelé via refresh si expiré. */
  async getFreshAccessToken(calendarRowId: string): Promise<string> {
    const cal = await this.db.query.tenantCalendars.findFirst({
      where: (c, { eq: e }) => e(c.id, calendarRowId),
    });
    if (!cal) throw new NotFoundError("Agenda introuvable");

    if (cal.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return cal.accessToken;

    const res = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.oauth.clientId,
        client_secret: this.oauth.clientSecret,
        refresh_token: cal.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      await this.markError(cal.id, `refresh token refusé (HTTP ${res.status})`);
      throw new BadRequestError("Renouvellement du token Google refusé", "oauth_refresh_failed");
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    await this.db
      .update(schema.tenantCalendars)
      .set({
        accessToken: data.access_token,
        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        lastError: null,
      })
      .where(eq(schema.tenantCalendars.id, cal.id));
    return data.access_token;
  }

  /** Créneaux occupés modifiés après `since` (transparency != transparent). */
  async listBusyEventsSince(
    calendarRowId: string,
    calendarId: string,
    since: Date,
  ): Promise<CalendarBusyEvent[]> {
    const token = await this.getFreshAccessToken(calendarRowId);
    const params = new URLSearchParams({
      updatedMin: since.toISOString(),
      singleEvents: "true",
      showDeleted: "false",
      maxResults: "250",
      orderBy: "updated",
    });
    const res = await this.fetchImpl(
      `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`events.list HTTP ${res.status}`);
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        status?: string;
        summary?: string;
        transparency?: string;
        updated?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };

    return (data.items ?? []).flatMap((e) => {
      // Annulé ou marqué "disponible" → pas un créneau occupant.
      if (e.status === "cancelled" || e.transparency === "transparent") return [];
      const start = parseEventTime(e.start);
      const end = parseEventTime(e.end);
      if (!start || !end || !e.updated) return [];
      return [{ id: e.id, summary: e.summary ?? null, start, end, updated: new Date(e.updated) }];
    });
  }

  async list(tenantId: string): Promise<SafeCalendar[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantCalendars)
      .where(eq(schema.tenantCalendars.tenantId, tenantId));
    return rows.map(toSafe);
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: "active" | "paused",
  ): Promise<SafeCalendar> {
    const [row] = await this.db
      .update(schema.tenantCalendars)
      .set({ status })
      .where(and(eq(schema.tenantCalendars.tenantId, tenantId), eq(schema.tenantCalendars.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Agenda introuvable");
    return toSafe(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.tenantCalendars)
      .where(and(eq(schema.tenantCalendars.tenantId, tenantId), eq(schema.tenantCalendars.id, id)))
      .returning({ id: schema.tenantCalendars.id });
    if (!row) throw new NotFoundError("Agenda introuvable");
  }

  private async exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }> {
    const res = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.oauth.clientId,
        client_secret: this.oauth.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.oauth.redirectUri,
      }),
    });
    if (!res.ok) {
      throw new BadRequestError(
        `Échange OAuth refusé (HTTP ${res.status})`,
        "oauth_exchange_failed",
      );
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    if (!data.refresh_token) {
      throw new BadRequestError("Google n'a pas fourni de refresh token", "oauth_no_refresh");
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  private async fetchPrimaryCalendar(
    accessToken: string,
  ): Promise<{ id: string; summary: string }> {
    const res = await this.fetchImpl(`${CALENDAR_BASE}/calendars/primary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new BadRequestError(
        `Impossible de lire l'agenda principal (HTTP ${res.status})`,
        "calendar_primary_failed",
      );
    }
    const data = (await res.json()) as { id?: string; summary?: string };
    if (!data.id) throw new BadRequestError("Agenda principal sans identifiant");
    return { id: data.id, summary: data.summary ?? data.id };
  }

  private async markError(id: string, message: string): Promise<void> {
    await this.db
      .update(schema.tenantCalendars)
      .set({ status: "error", lastError: message })
      .where(eq(schema.tenantCalendars.id, id));
  }

  private prunePendingStates(): void {
    const now = Date.now();
    for (const [state, entry] of this.pendingStates) {
      if (entry.expiresAt < now) this.pendingStates.delete(state);
    }
  }
}

/** dateTime (événement horaire) ou date (journée entière) → Date. */
function parseEventTime(t: { dateTime?: string; date?: string } | undefined): Date | null {
  if (!t) return null;
  const raw = t.dateTime ?? t.date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toSafe(row: TenantCalendar): SafeCalendar {
  const { accessToken: _a, refreshToken: _r, ...rest } = row;
  return rest;
}
