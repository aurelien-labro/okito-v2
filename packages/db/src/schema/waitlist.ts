import { date, index, integer, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Liste d'attente : quand un créneau est plein, le client peut rejoindre la
 * waitlist. Si une résa s'annule plus tard et libère le créneau, on notifie
 * automatiquement les entries pertinentes par ordre d'inscription.
 *
 * Status :
 *   waiting   → en attente, pas encore notifié
 *   notified  → client notifié qu'un créneau s'est libéré, en attente de
 *               sa réponse (TTL configurable)
 *   converted → client a confirmé, résa créée
 *   expired   → fenêtre passée sans conversion
 *   cancelled → le client a annulé sa demande de waitlist
 */
export const WAITLIST_STATUSES = [
  "waiting",
  "notified",
  "converted",
  "expired",
  "cancelled",
] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    couverts: integer("couverts").notNull(),

    dateSouhaitee: date("date_souhaitee").notNull(),
    heureSouhaitee: time("heure_souhaitee").notNull(),
    /** Tolérance autour de l'heure souhaitée pour matcher un créneau libéré. */
    flexMinutes: integer("flex_minutes").notNull().default(30),

    status: text("status", { enum: WAITLIST_STATUSES }).notNull().default("waiting"),

    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("waitlist_tenant_status_idx").on(t.tenantId, t.status, t.dateSouhaitee),
    index("waitlist_phone_idx").on(t.tenantId, t.customerPhone),
  ],
);

export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert;
