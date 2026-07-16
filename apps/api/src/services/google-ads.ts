import { randomBytes } from "node:crypto";
import { type Database, type TenantGoogleAdsConnection, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export interface GoogleAdsOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Connexion sans les tokens — seule forme qui sort par l'API admin. */
export type SafeGoogleAdsConnection = Omit<
  TenantGoogleAdsConnection,
  "accessToken" | "refreshToken"
>;

const SCOPE = "https://www.googleapis.com/auth/adwords";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
/** Durée de validité d'un state OAuth en attente (anti-CSRF). */
const STATE_TTL_MS = 10 * 60_000;

/**
 * Comptes Google Ads par tenant (OAuth 2.0, REST brut — même pattern que
 * GoogleCalendarService). v1 : connexion + gestion. L'ingestion des dépenses
 * et conversions viendra dans sa propre itération (elle exige un developer
 * token Google Ads approuvé, en plus de l'OAuth).
 */
export class GoogleAdsService {
  private readonly pendingStates = new Map<string, { tenantId: string; expiresAt: number }>();

  constructor(
    private readonly db: Database,
    private readonly oauth: GoogleAdsOAuthConfig,
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

  /** Callback OAuth : échange le code, crée la connexion. */
  async handleCallback(code: string, state: string): Promise<SafeGoogleAdsConnection> {
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new BadRequestError("State OAuth inconnu ou expiré", "oauth_state_invalid");
    }

    const tokens = await this.exchangeCode(code);

    const [row] = await this.db
      .insert(schema.tenantGoogleAdsConnections)
      .values({
        tenantId: pending.tenantId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.expiresAt,
      })
      .returning();
    if (!row) throw new Error("insert tenant_google_ads_connections failed");
    logger.info({ tenantId: pending.tenantId }, "Compte Google Ads connecté");
    return toSafe(row);
  }

  /** Access token valide — renouvelé via refresh si expiré (pour la future sync). */
  async getFreshAccessToken(connectionId: string): Promise<string> {
    const conn = await this.db.query.tenantGoogleAdsConnections.findFirst({
      where: (c, { eq: e }) => e(c.id, connectionId),
    });
    if (!conn) throw new NotFoundError("Connexion Google Ads introuvable");

    if (conn.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return conn.accessToken;

    const res = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.oauth.clientId,
        client_secret: this.oauth.clientSecret,
        refresh_token: conn.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      await this.db
        .update(schema.tenantGoogleAdsConnections)
        .set({ status: "error", lastError: `refresh token refusé (HTTP ${res.status})` })
        .where(eq(schema.tenantGoogleAdsConnections.id, conn.id));
      throw new BadRequestError("Renouvellement du token Google refusé", "oauth_refresh_failed");
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    await this.db
      .update(schema.tenantGoogleAdsConnections)
      .set({
        accessToken: data.access_token,
        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        lastError: null,
      })
      .where(eq(schema.tenantGoogleAdsConnections.id, conn.id));
    return data.access_token;
  }

  async list(tenantId: string): Promise<SafeGoogleAdsConnection[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantGoogleAdsConnections)
      .where(eq(schema.tenantGoogleAdsConnections.tenantId, tenantId));
    return rows.map(toSafe);
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: "active" | "paused",
  ): Promise<SafeGoogleAdsConnection> {
    const [row] = await this.db
      .update(schema.tenantGoogleAdsConnections)
      .set({ status })
      .where(
        and(
          eq(schema.tenantGoogleAdsConnections.tenantId, tenantId),
          eq(schema.tenantGoogleAdsConnections.id, id),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError("Connexion Google Ads introuvable");
    return toSafe(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.tenantGoogleAdsConnections)
      .where(
        and(
          eq(schema.tenantGoogleAdsConnections.tenantId, tenantId),
          eq(schema.tenantGoogleAdsConnections.id, id),
        ),
      )
      .returning({ id: schema.tenantGoogleAdsConnections.id });
    if (!row) throw new NotFoundError("Connexion Google Ads introuvable");
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

  private prunePendingStates(): void {
    const now = Date.now();
    for (const [state, entry] of this.pendingStates) {
      if (entry.expiresAt < now) this.pendingStates.delete(state);
    }
  }
}

function toSafe(row: TenantGoogleAdsConnection): SafeGoogleAdsConnection {
  const { accessToken: _a, refreshToken: _r, ...rest } = row;
  return rest;
}
