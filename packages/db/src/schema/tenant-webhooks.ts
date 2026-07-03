import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/** Événements diffusables vers les webhooks sortants. */
export const WEBHOOK_EVENTS = [
  "reservation.created",
  "reservation.cancelled",
  "reservation.no_show",
  "waitlist.joined",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const tenantWebhooks = pgTable(
  "tenant_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    /** Types d'événements abonnés. Vide = tous. */
    events: text("events").array().notNull().default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenant_webhooks_tenant_idx").on(t.tenantId)],
);

export type TenantWebhook = typeof tenantWebhooks.$inferSelect;
export type NewTenantWebhook = typeof tenantWebhooks.$inferInsert;
