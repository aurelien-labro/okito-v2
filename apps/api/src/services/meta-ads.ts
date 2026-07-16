import { randomBytes } from "node:crypto";
import { type Database, type TenantMetaConnection, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

/** Connexion sans le token — seule forme qui sort par l'API admin. */
export type SafeMetaConnection = Omit<TenantMetaConnection, "accessToken">;

const GRAPH_VERSION = "v19.0";
const AUTH_ENDPOINT = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
/** Lecture des campagnes publicitaires ; le canal Instagram/Messenger viendra après. */
const SCOPE = "ads_read";
/** Durée de validité d'un state OAuth en attente (anti-CSRF). */
const STATE_TTL_MS = 10 * 60_000;
/** Durée par défaut d'un token long-lived Meta (~60 jours). */
const LONG_LIVED_FALLBACK_S = 60 * 24 * 3600;

/**
 * Comptes Meta (Facebook & Instagram) par tenant (OAuth 2.0, REST brut).
 *
 * Particularité Meta : pas de refresh token — on échange le token court
 * contre un long-lived (~60 j) à la connexion ; le patron reconnecte quand il
 * expire. v1 : connexion + gestion. L'ingestion des dépenses Meta Ads et le
 * canal Instagram/Messenger viendront dans leurs propres itérations.
 */
export class MetaAdsService {
  private readonly pendingStates = new Map<string, { tenantId: string; expiresAt: number }>();

  constructor(
    private readonly db: Database,
    private readonly oauth: MetaOAuthConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  buildAuthUrl(tenantId: string): { url: string; state: string } {
    this.prunePendingStates();
    const state = randomBytes(24).toString("hex");
    this.pendingStates.set(state, { tenantId, expiresAt: Date.now() + STATE_TTL_MS });

    const params = new URLSearchParams({
      client_id: this.oauth.appId,
      redirect_uri: this.oauth.redirectUri,
      response_type: "code",
      scope: SCOPE,
      state,
    });
    return { url: `${AUTH_ENDPOINT}?${params}`, state };
  }

  /**
   * Callback OAuth : échange le code, convertit en token long-lived,
   * identifie le compte (/me), upsert la connexion.
   */
  async handleCallback(code: string, state: string): Promise<SafeMetaConnection> {
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new BadRequestError("State OAuth inconnu ou expiré", "oauth_state_invalid");
    }

    const shortLived = await this.exchangeCode(code);
    const longLived = await this.exchangeLongLived(shortLived);
    const me = await this.fetchMe(longLived.accessToken);

    const [row] = await this.db
      .insert(schema.tenantMetaConnections)
      .values({
        tenantId: pending.tenantId,
        externalAccountId: me.id,
        accountLabel: me.name,
        accessToken: longLived.accessToken,
        accessTokenExpiresAt: longLived.expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          schema.tenantMetaConnections.tenantId,
          schema.tenantMetaConnections.externalAccountId,
        ],
        set: {
          accountLabel: me.name,
          accessToken: longLived.accessToken,
          accessTokenExpiresAt: longLived.expiresAt,
          status: "active",
          lastError: null,
        },
      })
      .returning();
    if (!row) throw new Error("insert tenant_meta_connections failed");
    logger.info({ tenantId: pending.tenantId, account: me.name }, "Compte Meta connecté");
    return toSafe(row);
  }

  async list(tenantId: string): Promise<SafeMetaConnection[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantMetaConnections)
      .where(eq(schema.tenantMetaConnections.tenantId, tenantId));
    return rows.map(toSafe);
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: "active" | "paused",
  ): Promise<SafeMetaConnection> {
    const [row] = await this.db
      .update(schema.tenantMetaConnections)
      .set({ status })
      .where(
        and(
          eq(schema.tenantMetaConnections.tenantId, tenantId),
          eq(schema.tenantMetaConnections.id, id),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError("Connexion Meta introuvable");
    return toSafe(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.tenantMetaConnections)
      .where(
        and(
          eq(schema.tenantMetaConnections.tenantId, tenantId),
          eq(schema.tenantMetaConnections.id, id),
        ),
      )
      .returning({ id: schema.tenantMetaConnections.id });
    if (!row) throw new NotFoundError("Connexion Meta introuvable");
  }

  private async exchangeCode(code: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.oauth.appId,
      client_secret: this.oauth.appSecret,
      redirect_uri: this.oauth.redirectUri,
      code,
    });
    const res = await this.fetchImpl(`${GRAPH_BASE}/oauth/access_token?${params}`);
    if (!res.ok) {
      throw new BadRequestError(
        `Échange OAuth refusé (HTTP ${res.status})`,
        "oauth_exchange_failed",
      );
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  private async exchangeLongLived(
    shortLivedToken: string,
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.oauth.appId,
      client_secret: this.oauth.appSecret,
      fb_exchange_token: shortLivedToken,
    });
    const res = await this.fetchImpl(`${GRAPH_BASE}/oauth/access_token?${params}`);
    if (!res.ok) {
      throw new BadRequestError(
        `Échange long-lived refusé (HTTP ${res.status})`,
        "oauth_long_lived_failed",
      );
    }
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? LONG_LIVED_FALLBACK_S) * 1000),
    };
  }

  private async fetchMe(accessToken: string): Promise<{ id: string; name: string }> {
    const params = new URLSearchParams({ fields: "id,name", access_token: accessToken });
    const res = await this.fetchImpl(`${GRAPH_BASE}/me?${params}`);
    if (!res.ok) {
      throw new BadRequestError(
        `Impossible d'identifier le compte Meta (HTTP ${res.status})`,
        "meta_me_failed",
      );
    }
    const data = (await res.json()) as { id?: string; name?: string };
    if (!data.id) throw new BadRequestError("Compte Meta sans identifiant");
    return { id: data.id, name: data.name ?? data.id };
  }

  private prunePendingStates(): void {
    const now = Date.now();
    for (const [state, entry] of this.pendingStates) {
      if (entry.expiresAt < now) this.pendingStates.delete(state);
    }
  }
}

function toSafe(row: TenantMetaConnection): SafeMetaConnection {
  const { accessToken: _a, ...rest } = row;
  return rest;
}
