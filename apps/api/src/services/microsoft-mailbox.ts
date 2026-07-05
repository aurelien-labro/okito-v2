import { randomBytes } from "node:crypto";
import { type Database, type TenantMailbox, schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { toSafeImap as toSafe } from "./imap-mailbox.js";
import type { SafeMailbox } from "./mailbox.js";

export interface MicrosoftOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Scopes minimaux : lecture du courrier + profil (adresse) + refresh. */
const GRAPH_SCOPE =
  "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read";
const AUTH_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const ME_ENDPOINT = "https://graph.microsoft.com/v1.0/me";
const STATE_TTL_MS = 10 * 60_000;

/**
 * Connexion de boîtes Outlook / Microsoft 365 par tenant (OAuth 2.0 Microsoft
 * identity platform, REST brut — même architecture que MailboxService Gmail).
 *
 * Flow : buildAuthUrl (state anti-CSRF) → consentement Microsoft →
 * handleCallback (échange code → tokens + adresse via /me) → boîte active
 * provider="outlook". Le curseur de sync (deltaLink Graph) vit dans config.
 */
export class MicrosoftMailboxService {
  private readonly pendingStates = new Map<string, { tenantId: string; expiresAt: number }>();

  constructor(
    private readonly db: Database,
    private readonly oauth: MicrosoftOAuthConfig,
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
      response_mode: "query",
      scope: GRAPH_SCOPE,
      prompt: "consent",
      state,
    });
    return { url: `${AUTH_ENDPOINT}?${params}`, state };
  }

  async handleCallback(code: string, state: string): Promise<SafeMailbox> {
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new BadRequestError("State OAuth inconnu ou expiré", "oauth_state_invalid");
    }

    const tokens = await this.exchangeCode(code);
    const email = await this.fetchEmailAddress(tokens.accessToken);

    const [row] = await this.db
      .insert(schema.tenantMailboxes)
      .values({
        tenantId: pending.tenantId,
        provider: "outlook",
        emailAddress: email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.expiresAt,
      })
      .returning();
    if (!row) throw new Error("insert tenant_mailboxes failed");
    logger.info({ tenantId: pending.tenantId, email }, "Mailbox Outlook connectée");
    return toSafe(row);
  }

  /** Access token valide — renouvelé via refresh_token quand il expire. */
  async getFreshAccessToken(mailboxId: string): Promise<string> {
    const box = await this.db.query.tenantMailboxes.findFirst({
      where: (m, { eq: e }) => e(m.id, mailboxId),
    });
    if (!box) throw new NotFoundError("Boîte introuvable");
    if (!box.refreshToken || !box.accessTokenExpiresAt || !box.accessToken) {
      throw new BadRequestError("Boîte non-OAuth — pas de token", "not_oauth_mailbox");
    }

    if (box.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
      return box.accessToken;
    }

    const res = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.oauth.clientId,
        client_secret: this.oauth.clientSecret,
        refresh_token: box.refreshToken,
        grant_type: "refresh_token",
        scope: GRAPH_SCOPE,
      }),
    });
    if (!res.ok) {
      await this.db
        .update(schema.tenantMailboxes)
        .set({ status: "error", lastError: `refresh token refusé (HTTP ${res.status})` })
        .where(eq(schema.tenantMailboxes.id, box.id));
      throw new BadRequestError("Renouvellement du token Microsoft refusé", "oauth_refresh_failed");
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    await this.db
      .update(schema.tenantMailboxes)
      .set({
        accessToken: data.access_token,
        // Microsoft fait tourner les refresh tokens : garder le nouveau.
        ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        lastError: null,
      })
      .where(eq(schema.tenantMailboxes.id, box.id));
    return data.access_token;
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
        scope: GRAPH_SCOPE,
      }),
    });
    if (!res.ok) {
      throw new BadRequestError(
        `Échange OAuth Microsoft refusé (HTTP ${res.status})`,
        "oauth_exchange_failed",
      );
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    if (!data.refresh_token) {
      throw new BadRequestError("Microsoft n'a pas fourni de refresh token", "oauth_no_refresh");
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  private async fetchEmailAddress(accessToken: string): Promise<string> {
    const res = await this.fetchImpl(ME_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new BadRequestError(
        "Impossible de lire l'adresse de la boîte",
        "oauth_userinfo_failed",
      );
    }
    const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
    const email = data.mail ?? data.userPrincipalName;
    if (!email) throw new BadRequestError("Adresse absente du profil Microsoft");
    return email;
  }

  private prunePendingStates(): void {
    const now = Date.now();
    for (const [state, entry] of this.pendingStates) {
      if (entry.expiresAt < now) this.pendingStates.delete(state);
    }
  }
}
