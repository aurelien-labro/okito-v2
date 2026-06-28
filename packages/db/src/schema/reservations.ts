import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    dateReservation: date("date_reservation").notNull(),
    heure: time("heure").notNull(),
    couverts: integer("couverts").notNull(),

    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),

    status: text("status", { enum: ["confirmed", "cancelled", "no_show", "completed"] })
      .notNull()
      .default("confirmed"),
    source: text("source", { enum: ["web_widget", "whatsapp", "voice", "manual", "unknown"] })
      .notNull()
      .default("unknown"),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    /**
     * Acompte anti-no-show. Workflow :
     *   none → pas d'acompte demandé pour cette résa
     *   required → demandé mais pas encore initié (lien envoyé au client)
     *   pending → Payment Intent créé, client n'a pas encore payé
     *   paid → carte chargée, résa garantie
     *   refunded → remboursé après annulation valide
     *   failed → 3DS échoué, retry possible
     */
    depositStatus: text("deposit_status", {
      enum: ["none", "required", "pending", "paid", "refunded", "failed"],
    })
      .notNull()
      .default("none"),
    /** Snapshot du montant au moment de la création (immune aux futurs changements de prix). */
    depositAmountCents: integer("deposit_amount_cents"),
    depositPaymentIntentId: text("deposit_payment_intent_id"),
  },
  (table) => ({
    uniqActiveReservation: uniqueIndex("uniq_active_reservation").on(
      table.tenantId,
      table.customerPhone,
      table.dateReservation,
      table.heure,
    ),
    tenantDateConfirmed: index("idx_reservations_tenant_date")
      .on(table.tenantId, table.dateReservation)
      .where(sql`status = 'confirmed'`),
    phoneLookup: index("idx_reservations_phone").on(
      table.tenantId,
      table.customerPhone,
      table.dateReservation,
    ),
    creneauConfirmed: index("idx_reservations_creneau")
      .on(table.tenantId, table.dateReservation, table.heure)
      .where(sql`status = 'confirmed'`),
  }),
);

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
export type ReservationStatus = NonNullable<Reservation["status"]>;
export type ReservationSource = NonNullable<Reservation["source"]>;

/**
 * Alias génériques "Booking" pointant sur la table reservations.
 * Pour les futurs verticaux (hôtel, garage, etc.) qui parleront en "booking".
 * La table physique reste `reservations` pour V2 — un éventuel rename DB
 * sera fait avec une migration dédiée + alias SQL VIEW pour rétrocompat.
 */
export const bookings = reservations;
export type Booking = Reservation;
export type NewBooking = NewReservation;
