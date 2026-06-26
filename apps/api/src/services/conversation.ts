import {
  type Conversation,
  type ConversationChannel,
  type ConversationMessage,
  type Database,
  schema,
} from "@okito/db";
import { and, eq, sql } from "drizzle-orm";

export interface FindOrCreateInput {
  tenantId: string;
  channel: ConversationChannel;
  sessionKey: string;
}

export class ConversationService {
  constructor(private readonly db: Database) {}

  async findOrCreate(input: FindOrCreateInput): Promise<Conversation> {
    const existing = await this.db.query.conversations.findFirst({
      where: (c, { and: a, eq: e }) =>
        a(
          e(c.tenantId, input.tenantId),
          e(c.channel, input.channel),
          e(c.sessionKey, input.sessionKey),
          e(c.status, "active"),
        ),
    });
    if (existing) return existing;

    const [created] = await this.db
      .insert(schema.conversations)
      .values({
        tenantId: input.tenantId,
        channel: input.channel,
        sessionKey: input.sessionKey,
        status: "active",
        step: "idle",
      })
      .returning();
    if (!created) throw new Error("Échec de création de la conversation");
    return created;
  }

  async appendMessage(
    conversationId: string,
    tenantId: string,
    message: ConversationMessage,
  ): Promise<Conversation> {
    const [row] = await this.db
      .update(schema.conversations)
      .set({
        messages: sql`${schema.conversations.messages} || ${JSON.stringify([message])}::jsonb`,
        lastMessageAt: new Date(),
      })
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.tenantId, tenantId),
        ),
      )
      .returning();
    if (!row) throw new Error("Conversation introuvable lors de l'append");
    return row;
  }

  async mergeCollectedFields(
    conversationId: string,
    tenantId: string,
    fields: Record<string, unknown>,
  ): Promise<Conversation> {
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null && v !== "") filtered[k] = v;
    }
    if (Object.keys(filtered).length === 0) {
      const existing = await this.db.query.conversations.findFirst({
        where: (c, { and: a, eq: e }) => a(e(c.id, conversationId), e(c.tenantId, tenantId)),
      });
      if (!existing) throw new Error("Conversation introuvable lors du merge");
      return existing;
    }
    const [row] = await this.db
      .update(schema.conversations)
      .set({
        collectedFields: sql`coalesce(${schema.conversations.collectedFields}, '{}'::jsonb) || ${JSON.stringify(filtered)}::jsonb`,
        lastMessageAt: new Date(),
      })
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.tenantId, tenantId),
        ),
      )
      .returning();
    if (!row) throw new Error("Conversation introuvable lors du merge");
    return row;
  }

  async clearCollectedFields(
    conversationId: string,
    tenantId: string,
    keys: string[],
  ): Promise<Conversation> {
    if (keys.length === 0) {
      const existing = await this.db.query.conversations.findFirst({
        where: (c, { and: a, eq: e }) => a(e(c.id, conversationId), e(c.tenantId, tenantId)),
      });
      if (!existing) throw new Error("Conversation introuvable lors du clear");
      return existing;
    }
    const keysSql = sql.join(
      keys.map((k) => sql`${k}`),
      sql`, `,
    );
    const [row] = await this.db
      .update(schema.conversations)
      .set({
        collectedFields: sql`coalesce(${schema.conversations.collectedFields}, '{}'::jsonb) - array[${keysSql}]::text[]`,
        lastMessageAt: new Date(),
      })
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.tenantId, tenantId),
        ),
      )
      .returning();
    if (!row) throw new Error("Conversation introuvable lors du clear");
    return row;
  }

  async setStatus(
    conversationId: string,
    tenantId: string,
    status: "active" | "completed" | "abandoned",
    extra?: { reservationId?: string; step?: Conversation["step"] },
  ): Promise<void> {
    await this.db
      .update(schema.conversations)
      .set({
        status,
        ...(extra?.reservationId !== undefined && { reservationId: extra.reservationId }),
        ...(extra?.step !== undefined && { step: extra.step }),
        lastMessageAt: new Date(),
      })
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.tenantId, tenantId),
        ),
      );
  }
}
