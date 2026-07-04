import { randomBytes } from "node:crypto";
import { type Database, type TenantMailbox, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Boîte sans les tokens — seule forme qui sort par l'API admin. */
export type SafeMailbox = Omit<TenantMailbox, "accessToken" | "refreshToken">;

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
/** Durée de validité d'un state OAuth en attente (anti-CSRF). */
const STATE_TTL_MS = 10 * 60_000;

/**
 * Connexion de boîtes Gmail par tenant (OAuth 2.0, REST brut — pas de SDK).
 *
 * Flow : buildAuthUrl (state anti-CSRF lié au tenant) → consentement Google →
 * handleCallback (échange code → tokens + adresse) → boîte active.
 * getFreshAccessToken renouvelle via refresh_token quand l'access expire.
 *
 * Le state est gardé en mémoire process : suffisant pour une instance API
 * unique (Fly), à déplacer en DB si scale horizontal.
 */
export class MailboxService {
  private readonly pendingStates = new Map<string, { tenantId: string; expiresAt: number }>();

  constructor(
    private readonly db: Database,
    private readonly oauth: GoogleOAuthConfig,
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
      scope: `${GMAIL_SCOPE} email`,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return { url: `${AUTH_ENDPOINT}?${params}`, state };
  }

  /** Callback OAuth : échange le code, résout l'adresse, crée la boîte. */
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
        provider: "gmail",
        emailAddress: email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.expiresAt,
      })
      .returning();
    if (!row) throw new Error("insert tenant_mailboxes failed");
    logger.info({ tenantId: pending.tenantId, email }, "Mailbox Gmail connectée");
    return toSafe(row);
  }

  /** Access token valide pour une boîte — renouvelé via refresh si expiré. */
  async getFreshAccessToken(mailboxId: string): Promise<string> {
    const box = await this.db.query.tenantMailboxes.findFirst({
      where: (m, { eq: e }) => e(m.id, mailboxId),
    });
    if (!box) throw new NotFoundError("Boîte introuvable");

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
      }),
    });
    if (!res.ok) {
      await this.markError(box.id, `refresh token refusé (HTTP ${res.status})`);
      throw new BadRequestError("Renouvellement du token Google refusé", "oauth_refresh_failed");
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };

    await this.db
      .update(schema.tenantMailboxes)
      .set({
        accessToken: data.access_token,
        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        lastError: null,
      })
      .where(eq(schema.tenantMailboxes.id, box.id));
    return data.access_token;
  }

  async list(tenantId: string): Promise<SafeMailbox[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.tenantId, tenantId));
    return rows.map(toSafe);
  }

  async setStatus(tenantId: string, id: string, status: "active" | "paused"): Promise<SafeMailbox> {
    const [row] = await this.db
      .update(schema.tenantMailboxes)
      .set({ status })
      .where(and(eq(schema.tenantMailboxes.tenantId, tenantId), eq(schema.tenantMailboxes.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Boîte introuvable");
    return toSafe(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.tenantMailboxes)
      .where(and(eq(schema.tenantMailboxes.tenantId, tenantId), eq(schema.tenantMailboxes.id, id)))
      .returning({ id: schema.tenantMailboxes.id });
    if (!row) throw new NotFoundError("Boîte introuvable");
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
      // Arrive si l'utilisateur a déjà consenti sans prompt=consent — on exige
      // un refresh token, sinon la sync mourra à l'expiration de l'access.
      throw new BadRequestError("Google n'a pas fourni de refresh token", "oauth_no_refresh");
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  private async fetchEmailAddress(accessToken: string): Promise<string> {
    const res = await this.fetchImpl(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new BadRequestError(
        "Impossible de lire l'adresse de la boîte",
        "oauth_userinfo_failed",
      );
    }
    const data = (await res.json()) as { email?: string };
    if (!data.email) throw new BadRequestError("Adresse absente du profil Google");
    return data.email;
  }

  private async markError(id: string, message: string): Promise<void> {
    await this.db
      .update(schema.tenantMailboxes)
      .set({ status: "error", lastError: message })
      .where(eq(schema.tenantMailboxes.id, id));
  }

  private prunePendingStates(): void {
    const now = Date.now();
    for (const [state, entry] of this.pendingStates) {
      if (entry.expiresAt < now) this.pendingStates.delete(state);
    }
  }
}

function toSafe(row: TenantMailbox): SafeMailbox {
  const { accessToken: _a, refreshToken: _r, ...safe } = row;
  return safe;
}
