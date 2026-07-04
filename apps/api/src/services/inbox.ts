import { type Database, schema } from "@okito/db";
import { and, desc, eq, lt } from "drizzle-orm";

export interface InboxMessage {
  id: string;
  channel: "email";
  from: string | null;
  to: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null;
  createdAt: string;
}

export interface InboxPage {
  messages: InboxMessage[];
  nextCursor: string | null;
}

/**
 * Inbox unifiée (module V3, lecture seule pour l'instant).
 *
 * S'appuie sur le journal d'événements : chaque email ingéré par Gmail est un
 * event `email.received`. Ce service les projette en messages lisibles, avec
 * pagination par curseur (createdAt du dernier message). Les autres canaux
 * (WhatsApp, SMS) viendront brancher leurs propres types d'events ici.
 */
export class InboxService {
  constructor(private readonly db: Database) {}

  async list(tenantId: string, opts?: { limit?: number; before?: Date }): Promise<InboxPage> {
    const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
    const conditions = [
      eq(schema.events.tenantId, tenantId),
      eq(schema.events.type, "email.received"),
    ];
    if (opts?.before) conditions.push(lt(schema.events.createdAt, opts.before));

    const rows = await this.db
      .select()
      .from(schema.events)
      .where(and(...conditions))
      .orderBy(desc(schema.events.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1);

    return {
      messages: page.map((row) => {
        const p = row.payload as {
          messageId?: string;
          from?: string | null;
          to?: string | null;
          subject?: string | null;
          snippet?: string | null;
          receivedAt?: string | null;
        };
        return {
          id: row.id,
          channel: "email",
          from: p.from ?? null,
          to: p.to ?? null,
          subject: p.subject ?? null,
          snippet: p.snippet ?? null,
          receivedAt: p.receivedAt ?? null,
          createdAt: row.createdAt.toISOString(),
        };
      }),
      nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
    };
  }
}
