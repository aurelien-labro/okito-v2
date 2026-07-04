import { type Database, schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";
import type { MailboxService } from "./mailbox.js";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
/** Borne le nombre de messages traités par run/boîte : un backlog se rattrape sur plusieurs runs. */
const MAX_MESSAGES_PER_RUN = 50;

export interface GmailSyncRunResult {
  mailboxesProcessed: number;
  emailsIngested: number;
  errors: number;
}

/**
 * Synchronisation incrémentale Gmail → event bus (module Inbox V3).
 *
 * Par boîte active : users.history.list depuis le curseur historyId, fetch
 * des métadonnées de chaque nouveau message, publication d'un event
 * `email.received` par email. Première sync = bootstrap du curseur seulement
 * (on n'ingère que le courrier reçu APRÈS la connexion de la boîte).
 *
 * Un historyId expiré (Gmail purge ~1 semaine, HTTP 404) re-bootstrape le
 * curseur sans planter. Chaque boîte est isolée : une erreur marque la boîte
 * (status error + lastError) sans bloquer les autres.
 */
export class GmailSyncService {
  constructor(
    private readonly db: Database,
    private readonly mailboxes: MailboxService,
    private readonly bus: EventBusService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async runOnce(): Promise<GmailSyncRunResult> {
    const result: GmailSyncRunResult = { mailboxesProcessed: 0, emailsIngested: 0, errors: 0 };

    const boxes = await this.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.status, "active"));

    for (const box of boxes) {
      result.mailboxesProcessed++;
      try {
        result.emailsIngested += await this.syncMailbox(box.id, box.tenantId, box.historyId);
      } catch (err) {
        result.errors++;
        const message = err instanceof Error ? err.message : String(err);
        await this.db
          .update(schema.tenantMailboxes)
          .set({ status: "error", lastError: message })
          .where(eq(schema.tenantMailboxes.id, box.id));
        logger.error({ err, mailboxId: box.id }, "Gmail sync: boîte en erreur");
      }
    }
    return result;
  }

  private async syncMailbox(
    mailboxId: string,
    tenantId: string,
    historyId: string | null,
  ): Promise<number> {
    const token = await this.mailboxes.getFreshAccessToken(mailboxId);

    if (!historyId) {
      await this.bootstrapCursor(mailboxId, token);
      return 0;
    }

    const history = await this.gmailGet(
      token,
      `/history?startHistoryId=${historyId}&historyTypes=messageAdded&maxResults=100`,
    );
    if (history.status === 404) {
      // Curseur expiré côté Gmail : on repart d'un curseur frais.
      logger.warn({ mailboxId }, "Gmail sync: historyId expiré, re-bootstrap");
      await this.bootstrapCursor(mailboxId, token);
      return 0;
    }
    if (!history.ok) throw new Error(`history.list HTTP ${history.status}`);

    const data = (await history.json()) as {
      historyId?: string;
      history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>;
    };

    const messageIds = new Set<string>();
    for (const entry of data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) messageIds.add(added.message.id);
    }

    let ingested = 0;
    for (const id of [...messageIds].slice(0, MAX_MESSAGES_PER_RUN)) {
      const email = await this.fetchMessage(token, id);
      if (!email) continue;
      this.bus.publish(tenantId, "email.received", { ...email, mailboxId }, "gmail");
      ingested++;
    }

    await this.db
      .update(schema.tenantMailboxes)
      .set({
        historyId: data.historyId ?? historyId,
        lastSyncAt: new Date(),
        lastError: null,
      })
      .where(eq(schema.tenantMailboxes.id, mailboxId));
    return ingested;
  }

  private async bootstrapCursor(mailboxId: string, token: string): Promise<void> {
    const res = await this.gmailGet(token, "/profile");
    if (!res.ok) throw new Error(`profile HTTP ${res.status}`);
    const profile = (await res.json()) as { historyId?: string };
    if (!profile.historyId) throw new Error("profile sans historyId");

    await this.db
      .update(schema.tenantMailboxes)
      .set({ historyId: profile.historyId, lastSyncAt: new Date(), lastError: null })
      .where(eq(schema.tenantMailboxes.id, mailboxId));
  }

  private async fetchMessage(token: string, id: string): Promise<Record<string, unknown> | null> {
    const res = await this.gmailGet(
      token,
      `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
    );
    // Message supprimé entre le history.list et maintenant : on passe.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`messages.get HTTP ${res.status}`);

    const msg = (await res.json()) as {
      id: string;
      threadId?: string;
      snippet?: string;
      internalDate?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const header = (name: string) =>
      msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

    return {
      messageId: msg.id,
      threadId: msg.threadId ?? null,
      from: header("From"),
      to: header("To"),
      subject: header("Subject"),
      snippet: msg.snippet ?? null,
      receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
    };
  }

  private gmailGet(token: string, path: string): Promise<Response> {
    return this.fetchImpl(`${GMAIL_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}
