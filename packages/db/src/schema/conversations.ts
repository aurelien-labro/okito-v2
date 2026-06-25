import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { reservations } from "./reservations.js";
import { tenants } from "./tenants.js";

export type ConversationMessage = {
  role: "user" | "model";
  content: string;
  at: string;
};

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    channel: text("channel", { enum: ["web_widget", "whatsapp", "voice", "manual"] }).notNull(),
    sessionKey: text("session_key").notNull(),

    step: text("step", {
      enum: [
        "idle",
        "collecting_intent",
        "collecting_jour",
        "collecting_heure",
        "collecting_personnes",
        "collecting_nom",
        "confirming",
        "completed",
        "abandoned",
      ],
    })
      .notNull()
      .default("idle"),
    collectedFields: jsonb("collected_fields")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    messages: jsonb("messages").$type<ConversationMessage[]>().notNull().default([]),

    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),

    status: text("status", { enum: ["active", "completed", "abandoned"] })
      .notNull()
      .default("active"),

    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqActiveSession: uniqueIndex("uniq_active_session")
      .on(table.tenantId, table.channel, table.sessionKey)
      .where(sql`status = 'active'`),
    tenantSession: index("idx_conversations_tenant_session").on(table.tenantId, table.sessionKey),
    lastMsgActive: index("idx_conversations_last_msg")
      .on(table.lastMessageAt)
      .where(sql`status = 'active'`),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationStep = NonNullable<Conversation["step"]>;
export type ConversationChannel = NonNullable<Conversation["channel"]>;
