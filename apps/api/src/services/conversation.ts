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
