import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["web", "whatsapp", "voice"] }).notNull(),
  sessionKey: text("session_key").notNull(),
  step: text("step").notNull().default("greeting"),
  collectedFields: jsonb("collected_fields").$type<Record<string, unknown>>().notNull().default({}),
  history: jsonb("history")
    .$type<Array<{ role: "user" | "model"; content: string; at: string }>>()
    .notNull()
    .default([]),
  status: text("status", {
    enum: ["in_progress", "completed", "cancelled", "expired"],
  })
    .notNull()
    .default("in_progress"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
