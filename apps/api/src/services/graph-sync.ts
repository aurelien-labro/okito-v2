import { type Database, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";
import type { MicrosoftMailboxService } from "./microsoft-mailbox.js";

const DELTA_INIT =
  "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=latest";
/** Borne le nombre de messages traités par run/boîte. */
const MAX_MESSAGES_PER_RUN = 50;

export interface GraphSyncRunResult {
  mailboxesProcessed: number;
  emailsIngested: number;
  errors: number;
}

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  "@removed"?: unknown;
}

/**
 * Sync incrémentale Outlook/Microsoft 365 → event bus, via l'API delta de
 * Microsoft Graph (pendant Graph du historyId Gmail).
 *
 * Première sync = bootstrap du deltaLink avec $deltaToken=latest (on n'ingère
 * que le courrier reçu APRÈS la connexion). Ensuite : GET deltaLink → nouveaux
 * messages → events email.received → nouveau deltaLink stocké dans config.
 * Un deltaLink expiré (HTTP 410 Gone) re-bootstrape sans planter. Boîtes
 * isolées : une erreur marque la boîte sans bloquer les autres.
 */
export class GraphSyncService {
  constructor(
    private readonly db: Database,
    private readonly mailboxes: MicrosoftMailboxService,
    private readonly bus: EventBusService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async runOnce(): Promise<GraphSyncRunResult> {
    const result: GraphSyncRunResult = { mailboxesProcessed: 0, emailsIngested: 0, errors: 0 };

    const boxes = await this.db
      .select()
      .from(schema.tenantMailboxes)
      .where(
        and(
          eq(schema.tenantMailboxes.status, "active"),
          eq(schema.tenantMailboxes.provider, "outlook"),
        ),
      );

    for (const box of boxes) {
      result.mailboxesProcessed++;
      try {
        const config = (box.config ?? {}) as { deltaLink?: string };
        result.emailsIngested += await this.syncMailbox(
          box.id,
          box.tenantId,
          config.deltaLink ?? null,
        );
      } catch (err) {
        result.errors++;
        const message = err instanceof Error ? err.message : String(err);
        await this.db
          .update(schema.tenantMailboxes)
          .set({ status: "error", lastError: message })
          .where(eq(schema.tenantMailboxes.id, box.id));
        logger.error({ err, mailboxId: box.id }, "Graph sync: boîte en erreur");
      }
    }
    return result;
  }

  private async syncMailbox(
    mailboxId: string,
    tenantId: string,
    deltaLink: string | null,
  ): Promise<number> {
    const token = await this.mailboxes.getFreshAccessToken(mailboxId);

    if (!deltaLink) {
      await this.bootstrapCursor(mailboxId, token);
      return 0;
    }

    let url: string | null = deltaLink;
    let ingested = 0;
    let nextDeltaLink: string | null = null;

    while (url) {
      const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 410) {
        // deltaLink expiré côté Graph : on repart d'un curseur frais.
        logger.warn({ mailboxId }, "Graph sync: deltaLink expiré, re-bootstrap");
        await this.bootstrapCursor(mailboxId, token);
        return ingested;
      }
      if (!res.ok) throw new Error(`delta HTTP ${res.status}`);

      const data = (await res.json()) as {
        value?: GraphMessage[];
        "@odata.nextLink"?: string;
        "@odata.deltaLink"?: string;
      };

      for (const msg of data.value ?? []) {
        if (msg["@removed"] || ingested >= MAX_MESSAGES_PER_RUN) continue;
        this.bus.publish(
          tenantId,
          "email.received",
          {
            messageId: msg.id,
            threadId: msg.conversationId ?? null,
            from: formatAddress(msg.from?.emailAddress),
            to: formatAddress(msg.toRecipients?.[0]?.emailAddress),
            subject: msg.subject ?? null,
            snippet: msg.bodyPreview ?? null,
            receivedAt: msg.receivedDateTime ?? null,
            mailboxId,
          },
          "outlook",
        );
        ingested++;
      }

      nextDeltaLink = data["@odata.deltaLink"] ?? nextDeltaLink;
      url = data["@odata.nextLink"] ?? null;
    }

    if (nextDeltaLink) await this.saveCursor(mailboxId, nextDeltaLink);
    return ingested;
  }

  private async bootstrapCursor(mailboxId: string, token: string): Promise<void> {
    const res = await this.fetchImpl(DELTA_INIT, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`delta init HTTP ${res.status}`);
    const data = (await res.json()) as { "@odata.deltaLink"?: string };
    if (!data["@odata.deltaLink"]) throw new Error("delta init sans deltaLink");
    await this.saveCursor(mailboxId, data["@odata.deltaLink"]);
  }

  private async saveCursor(mailboxId: string, deltaLink: string): Promise<void> {
    const box = await this.db.query.tenantMailboxes.findFirst({
      where: (m, { eq: e }) => e(m.id, mailboxId),
      columns: { config: true },
    });
    await this.db
      .update(schema.tenantMailboxes)
      .set({
        config: { ...((box?.config ?? {}) as Record<string, unknown>), deltaLink },
        lastSyncAt: new Date(),
        lastError: null,
      })
      .where(eq(schema.tenantMailboxes.id, mailboxId));
  }
}

function formatAddress(a?: { name?: string; address?: string }): string | null {
  if (!a) return null;
  if (a.name && a.address) return `${a.name} <${a.address}>`;
  return a.address ?? a.name ?? null;
}
