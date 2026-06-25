import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  timezone: text("timezone").notNull().default("Europe/Paris"),

  capacityMax: integer("capacity_max").notNull().default(50),

  serviceLunchStart: time("service_lunch_start").notNull().default(sql`'12:00'`),
  serviceLunchEnd: time("service_lunch_end").notNull().default(sql`'14:30'`),
  serviceDinnerStart: time("service_dinner_start").notNull().default(sql`'19:00'`),
  serviceDinnerEnd: time("service_dinner_end").notNull().default(sql`'22:00'`),

  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  reminderHour: time("reminder_hour").notNull().default(sql`'09:00'`),

  status: text("status", { enum: ["active", "suspended", "trial"] })
    .notNull()
    .default("active"),
  stripeCustomerId: text("stripe_customer_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantStatus = NonNullable<Tenant["status"]>;
