import { type Database, schema } from "@okito/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";
import type { ImapConfig, ImapMailboxService } from "./imap-mailbox.js";
import { type ImapConnectionFactory, imapflowConnectionFactory } from "./imap-mailbox.js";

/** Borne le nombre de messages traités par run/boîte. */
const MAX_MESSAGES_PER_RUN = 50;

export interface ImapSyncRunResult {
  mailboxesProcessed: number;
  emailsIngested: number;
  errors: number;
}

/**
 * Sync incrémentale IMAP → event bus (pendant IMAP de GmailSyncService).
 *
 * Par boîte imap/yahoo active : connexion, INBOX, fetch des UID > lastUid,
 * un event `email.received` par message, avance du curseur. Un UIDVALIDITY
 * qui change (boîte recréée côté serveur) re-bootstrape le curseur sans
 * réingérer l'historique. Chaque boîte est isolée : une erreur la marque
 * (status error + lastError) sans bloquer les autres.
 */
export class ImapSyncService {
  constructor(
    private readonly db: Database,
    private readonly mailboxes: ImapMailboxService,
    private readonly bus: EventBusService,
    private readonly connect: ImapConnectionFactory = imapflowConnectionFactory,
  ) {}

  async runOnce(): Promise<ImapSyncRunResult> {
    const result: ImapSyncRunResult = { mailboxesProcessed: 0, emailsIngested: 0, errors: 0 };

    const boxes = await this.db
      .select()
      .from(schema.tenantMailboxes)
      .where(
        and(
          eq(schema.tenantMailboxes.status, "active"),
          sql`${schema.tenantMailboxes.provider} in ('imap', 'yahoo')`,
        ),
      );

    for (const box of boxes) {
      result.mailboxesProcessed++;
      try {
        result.emailsIngested += await this.syncMailbox(
          box.id,
          box.tenantId,
          box.provider,
          box.config as unknown as ImapConfig,
        );
      } catch (err) {
        result.errors++;
        const message = err instanceof Error ? err.message : String(err);
        await this.db
          .update(schema.tenantMailboxes)
          .set({ status: "error", lastError: message })
          .where(eq(schema.tenantMailboxes.id, box.id));
        logger.error({ err, mailboxId: box.id }, "IMAP sync: boîte en erreur");
      }
    }
    return result;
  }

  private async syncMailbox(
    mailboxId: string,
    tenantId: string,
    provider: string,
    config: ImapConfig,
  ): Promise<number> {
    const conn = await this.connect({
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      password: this.mailboxes.decryptPassword(config),
    });

    try {
      const inbox = await conn.openInbox();

      // Boîte recréée côté serveur : les UID ne sont plus comparables.
      if (config.uidValidity !== null && inbox.uidValidity !== config.uidValidity) {
        logger.warn({ mailboxId }, "IMAP sync: UIDVALIDITY changé, re-bootstrap du curseur");
        await this.saveCursor(mailboxId, config, inbox.uidValidity, inbox.uidNext - 1);
        return 0;
      }

      const lastUid = config.lastUid ?? inbox.uidNext - 1;
      const messages = (await conn.fetchSince(lastUid)).slice(0, MAX_MESSAGES_PER_RUN);

      let maxUid = lastUid;
      for (const msg of messages) {
        this.bus.publish(
          tenantId,
          "email.received",
          {
            messageId: String(msg.uid),
            threadId: null,
            from: msg.from,
            to: msg.to,
            subject: msg.subject,
            snippet: null,
            receivedAt: msg.date ? msg.date.toISOString() : null,
            mailboxId,
          },
          provider,
        );
        if (msg.uid > maxUid) maxUid = msg.uid;
      }

      await this.saveCursor(mailboxId, config, inbox.uidValidity, maxUid);
      return messages.length;
    } finally {
      await conn.close();
    }
  }

  private async saveCursor(
    mailboxId: string,
    config: ImapConfig,
    uidValidity: string,
    lastUid: number,
  ): Promise<void> {
    await this.db
      .update(schema.tenantMailboxes)
      .set({
        config: { ...config, uidValidity, lastUid },
        lastSyncAt: new Date(),
        lastError: null,
      })
      .where(eq(schema.tenantMailboxes.id, mailboxId));
  }
}
