import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Suivi des abonnements Stripe par tenant. Source de vérité = Stripe ;
 * cette table est un cache local mis à jour via webhook
 * customer.subscription.{created, updated, deleted}.
 *
 * Permet de verrouiller des features quand `status !== 'active'` sans
 * faire un round-trip Stripe à chaque requête.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripePriceId: text("stripe_price_id").notNull(),

    /** active | trialing | past_due | canceled | unpaid | incomplete */
    status: text("status").notNull(),

    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_tenant_idx").on(t.tenantId),
    index("subscriptions_status_idx").on(t.status),
    unique().on(t.tenantId, t.stripeSubscriptionId),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
