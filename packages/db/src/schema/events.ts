import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Journal append-only de tous les événements métier (event bus V3).
 *
 * Chaque module publie ici au lieu d'appeler ses voisins : c'est la source
 * unique que Jarvis (Observer/Advisor) requête pour son contexte, son brief
 * matinal et la timeline client 360°. Ne jamais UPDATE/DELETE une ligne.
 *
 * Types standardisés : "<entity>.<verb>" (ex: "reservation.created",
 * "review.posted"), même convention que audit_log et tenant_webhooks.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    type: text("type").notNull(),
    source: text("source").notNull().default("api"),
    payload: jsonb("payload").notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("events_type_created_idx").on(t.type, t.createdAt),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
