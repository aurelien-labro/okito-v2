import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Trace des actions admin pour pouvoir répondre à "qui a fait quoi quand"
 * et restaurer un état si besoin (before/after stockent l'état entier en JSONB).
 *
 * Actions standardisées : "<entity>.<verb>" (ex: "tenant.update", "reservation.cancel").
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),

    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),

    action: text("action").notNull(),

    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),

    before: jsonb("before"),
    after: jsonb("after"),

    ip: text("ip"),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_actor_idx").on(t.actorUserId, t.createdAt),
  ],
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
