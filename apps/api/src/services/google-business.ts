import { randomBytes } from "node:crypto";
import { type Database, type TenantGoogleBusiness, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export interface GoogleBusinessOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Connexion sans les tokens — seule forme qui sort par l'API admin. */
export type SafeGoogleBusinessConnection = Omit<
  TenantGoogleBusiness,
  "accessToken" | "refreshToken"
>;

export interface GoogleReview {
  /** Ressource complète : accounts/{a}/locations/{l}/reviews/{r}. */
  name: string;
  rating: number;
  comment: string | null;
  reviewerName: string | null;
  hasReply: boolean;
  updateTime: Date;
}

const SCOPE = "https://www.googleapis.com/auth/business.manage";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ACCOUNTS_ENDPOINT = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const LOCATIONS_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
/** L'API avis n'existe qu'en v4 legacy — Google n'a jamais porté reviews en v1. */
const REVIEWS_BASE = "https://mybusiness.googleapis.com/v4";
/** Durée de validité d'un state OAuth en attente (anti-CSRF). */
const STATE_TTL_MS = 10 * 60_000;

/** starRating (enum texte v4) → note 1..5. */
const STAR_RATINGS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/**
 * Connexion de fiches Google Business Profile par tenant (OAuth 2.0, REST
 * brut — même pattern que MailboxService).
 *
 * Flow : buildAuthUrl (state anti-CSRF lié au tenant) → consentement Google →
 * handleCallback (échange code → tokens, découverte compte + première fiche)
 * → connexion active. getFreshAccessToken renouvelle via refresh_token.
 *
 * v1 : une seule fiche par connexion (la première du compte). Multi-fiches =
 * multi-établissements (P3).
 */
export class GoogleBusinessService {
  private readonly pendingStates = new Map<string, { tenantId: string; expiresAt: number }>();

  constructor(
    private readonly db: Database,
    private readonly oauth: GoogleBusinessOAuthConfig,
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

  /** Callback OAuth : échange le code, découvre compte + fiche, crée la connexion. */
  async handleCallback(code: string, state: string): Promise<SafeGoogleBusinessConnection> {
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new BadRequestError("State OAuth inconnu ou expiré", "oauth_state_invalid");
    }

    const tokens = await this.exchangeCode(code);
    const account = await this.fetchFirstAccount(tokens.accessToken);
    const location = await this.fetchFirstLocation(tokens.accessToken, account);

    const [row] = await this.db
      .insert(schema.tenantGoogleBusiness)
      .values({
        tenantId: pending.tenantId,
        accountName: account,
        locationName: location.name,
        locationTitle: location.title,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.expiresAt,
      })
      .onConflictDoUpdate({
        target: [schema.tenantGoogleBusiness.tenantId, schema.tenantGoogleBusiness.locationName],
        set: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessTokenExpiresAt: tokens.expiresAt,
          status: "active",
          lastError: null,
        },
      })
      .returning();
    if (!row) throw new Error("insert tenant_google_business failed");
    logger.info(
      { tenantId: pending.tenantId, location: location.title },
      "Fiche Google Business connectée",
    );
    return toSafe(row);
  }

  /** Access token valide pour une connexion — renouvelé via refresh si expiré. */
  async getFreshAccessToken(connectionId: string): Promise<string> {
    const conn = await this.db.query.tenantGoogleBusiness.findFirst({
      where: (g, { eq: e }) => e(g.id, connectionId),
    });
    if (!conn) throw new NotFoundError("Connexion Google Business introuvable");

    if (conn.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
      return conn.accessToken;
    }

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
      await this.markError(conn.id, `refresh token refusé (HTTP ${res.status})`);
      throw new BadRequestError("Renouvellement du token Google refusé", "oauth_refresh_failed");
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };

    await this.db
      .update(schema.tenantGoogleBusiness)
      .set({
        accessToken: data.access_token,
        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        lastError: null,
      })
      .where(eq(schema.tenantGoogleBusiness.id, conn.id));
    return data.access_token;
  }

  /** Avis de la fiche, du plus récent au plus ancien (une page suffit en v1). */
  async listReviews(connectionId: string, pageSize = 50): Promise<GoogleReview[]> {
    const conn = await this.db.query.tenantGoogleBusiness.findFirst({
      where: (g, { eq: e }) => e(g.id, connectionId),
    });
    if (!conn) throw new NotFoundError("Connexion Google Business introuvable");
    const token = await this.getFreshAccessToken(connectionId);

    const parent = `${conn.accountName}/${conn.locationName}`;
    const res = await this.fetchImpl(`${REVIEWS_BASE}/${parent}/reviews?pageSize=${pageSize}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`reviews.list HTTP ${res.status}`);
    const data = (await res.json()) as {
      reviews?: Array<{
        name: string;
        starRating?: string;
        comment?: string;
        reviewer?: { displayName?: string };
        reviewReply?: { comment?: string };
        updateTime?: string;
      }>;
    };

    return (data.reviews ?? []).flatMap((r) => {
      const rating = STAR_RATINGS[r.starRating ?? ""];
      if (!rating || !r.updateTime) return [];
      return [
        {
          name: r.name,
          rating,
          comment: r.comment ?? null,
          reviewerName: r.reviewer?.displayName ?? null,
          hasReply: r.reviewReply !== undefined,
          updateTime: new Date(r.updateTime),
        },
      ];
    });
  }

  /** Publie (ou remplace) la réponse du commerce à un avis. */
  async replyToReview(connectionId: string, reviewName: string, comment: string): Promise<void> {
    const token = await this.getFreshAccessToken(connectionId);
    const res = await this.fetchImpl(`${REVIEWS_BASE}/${reviewName}/reply`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    });
    if (!res.ok) throw new Error(`reviews.updateReply HTTP ${res.status}`);
  }

  async list(tenantId: string): Promise<SafeGoogleBusinessConnection[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantGoogleBusiness)
      .where(eq(schema.tenantGoogleBusiness.tenantId, tenantId));
    return rows.map(toSafe);
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: "active" | "paused",
  ): Promise<SafeGoogleBusinessConnection> {
    const [row] = await this.db
      .update(schema.tenantGoogleBusiness)
      .set({ status })
      .where(
        and(
          eq(schema.tenantGoogleBusiness.tenantId, tenantId),
          eq(schema.tenantGoogleBusiness.id, id),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError("Connexion Google Business introuvable");
    return toSafe(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.tenantGoogleBusiness)
      .where(
        and(
          eq(schema.tenantGoogleBusiness.tenantId, tenantId),
          eq(schema.tenantGoogleBusiness.id, id),
        ),
      )
      .returning({ id: schema.tenantGoogleBusiness.id });
    if (!row) throw new NotFoundError("Connexion Google Business introuvable");
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

  private async fetchFirstAccount(accessToken: string): Promise<string> {
    const res = await this.fetchImpl(ACCOUNTS_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new BadRequestError(
        `Impossible de lister les comptes Business Profile (HTTP ${res.status})`,
        "gbp_accounts_failed",
      );
    }
    const data = (await res.json()) as { accounts?: Array<{ name: string }> };
    const account = data.accounts?.[0]?.name;
    if (!account) {
      throw new BadRequestError("Aucun compte Business Profile sur ce compte Google");
    }
    return account;
  }

  private async fetchFirstLocation(
    accessToken: string,
    account: string,
  ): Promise<{ name: string; title: string }> {
    const res = await this.fetchImpl(
      `${LOCATIONS_BASE}/${account}/locations?readMask=name,title&pageSize=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new BadRequestError(
        `Impossible de lister les fiches (HTTP ${res.status})`,
        "gbp_locations_failed",
      );
    }
    const data = (await res.json()) as { locations?: Array<{ name: string; title?: string }> };
    const location = data.locations?.[0];
    if (!location) {
      throw new BadRequestError("Aucune fiche Google Business sur ce compte");
    }
    return { name: location.name, title: location.title ?? location.name };
  }

  private async markError(id: string, message: string): Promise<void> {
    await this.db
      .update(schema.tenantGoogleBusiness)
      .set({ status: "error", lastError: message })
      .where(eq(schema.tenantGoogleBusiness.id, id));
  }

  private prunePendingStates(): void {
    const now = Date.now();
    for (const [state, entry] of this.pendingStates) {
      if (entry.expiresAt < now) this.pendingStates.delete(state);
    }
  }
}

function toSafe(row: TenantGoogleBusiness): SafeGoogleBusinessConnection {
  const { accessToken: _a, refreshToken: _r, ...rest } = row;
  return rest;
}
