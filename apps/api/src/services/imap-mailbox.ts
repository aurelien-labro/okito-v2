import { type Database, type TenantMailbox, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { SecretBox } from "../lib/secret-box.js";
import type { SafeMailbox } from "./mailbox.js";

/** Réglages stockés dans tenant_mailboxes.config pour les providers IMAP. */
export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passwordEnc: string;
  /** Curseur de sync : UIDVALIDITY de l'INBOX + dernier UID ingéré. */
  uidValidity: string | null;
  lastUid: number | null;
}

export interface ImapConnectInput {
  provider: "imap" | "yahoo";
  host?: string;
  port?: number;
  secure?: boolean;
  user: string;
  password: string;
}

/** Préréglages par provider — Yahoo est un IMAP à host imposé. */
const PRESETS: Record<"imap" | "yahoo", { host?: string; port: number; secure: boolean }> = {
  yahoo: { host: "imap.mail.yahoo.com", port: 993, secure: true },
  imap: { port: 993, secure: true },
};

/** Une conversation IMAP minimale — implémentée par imapflow, mockée en test. */
export interface ImapConnection {
  /** Ouvre INBOX et retourne son état. */
  openInbox(): Promise<{ uidValidity: string; uidNext: number }>;
  /** Envelopes des messages d'UID > sinceUid (bornés par le caller). */
  fetchSince(sinceUid: number): Promise<
    Array<{
      uid: number;
      from: string | null;
      to: string | null;
      subject: string | null;
      date: Date | null;
    }>
  >;
  close(): Promise<void>;
}

export type ImapConnectionFactory = (opts: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}) => Promise<ImapConnection>;

/** Implémentation réelle via imapflow (import paresseux : lourde au chargement). */
export const imapflowConnectionFactory: ImapConnectionFactory = async (opts) => {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: opts.secure,
    auth: { user: opts.user, pass: opts.password },
    logger: false,
  });
  await client.connect();
  return {
    async openInbox() {
      const box = await client.mailboxOpen("INBOX");
      return { uidValidity: String(box.uidValidity), uidNext: box.uidNext };
    },
    async fetchSince(sinceUid: number) {
      const out: Awaited<ReturnType<ImapConnection["fetchSince"]>> = [];
      for await (const msg of client.fetch(
        `${sinceUid + 1}:*`,
        { envelope: true, uid: true },
        { uid: true },
      )) {
        // `${n}:*` renvoie toujours au moins le dernier message : refiltrer.
        if (msg.uid <= sinceUid) continue;
        const env = msg.envelope;
        out.push({
          uid: msg.uid,
          from: env?.from?.[0] ? formatAddress(env.from[0]) : null,
          to: env?.to?.[0] ? formatAddress(env.to[0]) : null,
          subject: env?.subject ?? null,
          date: env?.date ?? null,
        });
      }
      return out;
    },
    async close() {
      await client.logout().catch(() => client.close());
    },
  };
};

function formatAddress(a: { name?: string; address?: string }): string {
  if (a.name && a.address) return `${a.name} <${a.address}>`;
  return a.address ?? a.name ?? "";
}

/**
 * Boîtes IMAP (générique + Yahoo) : connexion par identifiants, mot de passe
 * chiffré AES-256-GCM au repos, jamais exposé par l'API. Le curseur UID est
 * initialisé à la connexion : on n'ingère que le courrier reçu APRÈS.
 */
export class ImapMailboxService {
  constructor(
    private readonly db: Database,
    private readonly box: SecretBox,
    private readonly connect: ImapConnectionFactory = imapflowConnectionFactory,
  ) {}

  async addMailbox(tenantId: string, input: ImapConnectInput): Promise<SafeMailbox> {
    const preset = PRESETS[input.provider];
    const host = input.provider === "yahoo" ? (preset.host as string) : input.host?.trim();
    if (!host) throw new BadRequestError("Serveur IMAP requis", "imap_host_required");
    const port = input.port ?? preset.port;
    const secure = input.secure ?? preset.secure;

    // Vérifie les identifiants ET initialise le curseur en une connexion.
    let conn: ImapConnection;
    try {
      conn = await this.connect({ host, port, secure, user: input.user, password: input.password });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestError(`Connexion IMAP refusée : ${msg}`, "imap_auth_failed");
    }
    let inbox: { uidValidity: string; uidNext: number };
    try {
      inbox = await conn.openInbox();
    } finally {
      await conn.close();
    }

    const config: ImapConfig = {
      host,
      port,
      secure,
      user: input.user,
      passwordEnc: this.box.encrypt(input.password),
      uidValidity: inbox.uidValidity,
      lastUid: inbox.uidNext - 1,
    };

    const [row] = await this.db
      .insert(schema.tenantMailboxes)
      .values({
        tenantId,
        provider: input.provider,
        emailAddress: input.user,
        config,
      })
      .returning();
    if (!row) throw new Error("insert tenant_mailboxes failed");
    logger.info({ tenantId, provider: input.provider, host }, "Boîte IMAP connectée");
    return toSafeImap(row);
  }

  async list(tenantId: string): Promise<SafeMailbox[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.tenantId, tenantId));
    return rows.map(toSafeImap);
  }

  async setStatus(tenantId: string, id: string, status: "active" | "paused"): Promise<SafeMailbox> {
    const [row] = await this.db
      .update(schema.tenantMailboxes)
      .set({ status })
      .where(and(eq(schema.tenantMailboxes.tenantId, tenantId), eq(schema.tenantMailboxes.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Boîte introuvable");
    return toSafeImap(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.tenantMailboxes)
      .where(and(eq(schema.tenantMailboxes.tenantId, tenantId), eq(schema.tenantMailboxes.id, id)))
      .returning({ id: schema.tenantMailboxes.id });
    if (!row) throw new NotFoundError("Boîte introuvable");
  }

  /** Mot de passe en clair pour la sync — usage interne uniquement. */
  decryptPassword(config: ImapConfig): string {
    return this.box.decrypt(config.passwordEnc);
  }
}

/** Boîte sans tokens ET sans passwordEnc — seule forme qui sort par l'API. */
export function toSafeImap(row: TenantMailbox): SafeMailbox {
  const { accessToken: _a, refreshToken: _r, ...rest } = row;
  const config = (rest.config ?? {}) as Record<string, unknown>;
  const { passwordEnc: _p, ...safeConfig } = config;
  return { ...rest, config: safeConfig };
}
