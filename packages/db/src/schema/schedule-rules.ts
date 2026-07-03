import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ServiceWindow } from "./tenants.js";
import { tenants } from "./tenants.js";

export const SCHEDULE_RULE_KINDS = ["weekly_closed", "date_closed", "date_special"] as const;
export type ScheduleRuleKind = (typeof SCHEDULE_RULE_KINDS)[number];

/** weekly_closed : jours de fermeture hebdomadaire (0=dimanche … 6=samedi). */
export interface WeeklyClosedPayload {
  weekdays: number[];
}

/** date_closed : un jour précis OU une plage [from, to] incluse. */
export interface DateClosedPayload {
  date?: string;
  from?: string;
  to?: string;
}

/** date_special : horaires exceptionnels pour un jour (prioritaire sur tout). */
export interface DateSpecialPayload {
  date: string;
  services: ServiceWindow[];
}

export type ScheduleRulePayload = WeeklyClosedPayload | DateClosedPayload | DateSpecialPayload;

export const tenantScheduleRules = pgTable("tenant_schedule_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: SCHEDULE_RULE_KINDS }).notNull(),
  payload: jsonb("payload").$type<ScheduleRulePayload>().notNull().default(sql`'{}'::jsonb`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScheduleRule = typeof tenantScheduleRules.$inferSelect;
export type NewScheduleRule = typeof tenantScheduleRules.$inferInsert;
