import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Industry du tenant. Détermine quel IndustryProfile charger (champs, prompt, défauts).
 * Démarre avec "restaurant" (V1 porté). Ajouter les autres au fur et à mesure du build vertical.
 */
export const INDUSTRY_VALUES = [
  "restaurant",
  "hotel",
  "garage",
  "beauty",
  "realestate",
  "rental",
  "generic",
] as const;
export type Industry = (typeof INDUSTRY_VALUES)[number];

/**
 * Feature flags par tenant. Override possible des défauts du profile.
 * - voice : agent voix Vapi actif
 * - reminders : envoi de rappels J-1
 * - deposits : prise d'acompte Stripe (hôtels, groupes)
 * - waitlist : liste d'attente quand slot plein
 * - loyalty : programme fidélité
 * - multi_resource : inventaire typé (chambres, baies, véhicules)
 */
export type TenantFeatures = {
  voice?: boolean;
  reminders?: boolean;
  deposits?: boolean;
  waitlist?: boolean;
  loyalty?: boolean;
  multi_resource?: boolean;
};

export const DEFAULT_FEATURES: TenantFeatures = {
  voice: true,
  reminders: true,
  deposits: false,
  waitlist: false,
  loyalty: false,
  multi_resource: false,
};

/**
 * Plage d'ouverture libre — multi-vertical (déjeuner, dîner, check-in, atelier matin…).
 * Stockée dans tenants.services (JSONB array).
 *
 * Format heures : "HH:MM" 24h. La fenêtre est inclusive sur start, exclusive sur end :
 * un client peut réserver à start mais pas à end. label sert uniquement à l'affichage.
 *
 * Quand le tableau est vide, le code fallback sur les 4 colonnes legacy
 * service_lunch_start/end + service_dinner_start/end (path resto historique).
 */
export type ServiceWindow = {
  label: string;
  start: string;
  end: string;
};

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  timezone: text("timezone").notNull().default("Europe/Paris"),

  industry: text("industry", { enum: INDUSTRY_VALUES }).notNull().default("restaurant"),
  features: jsonb("features").$type<TenantFeatures>().notNull().default(DEFAULT_FEATURES),

  capacityMax: integer("capacity_max").notNull().default(50),

  /**
   * Plages d'ouverture flexibles (multi-vertical). Si vide, fallback sur les
   * 4 colonnes service_lunch_start/end et service_dinner_start/end (resto-only).
   */
  services: jsonb("services").$type<ServiceWindow[]>().notNull().default([]),

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
