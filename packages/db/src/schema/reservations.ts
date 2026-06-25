import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    partySize: integer("party_size").notNull(),
    reservedDate: text("reserved_date").notNull(),
    reservedTime: text("reserved_time").notNull(),
    notes: text("notes"),
    status: text("status", {
      enum: ["pending", "confirmed", "cancelled", "no_show", "completed"],
    })
      .notNull()
      .default("confirmed"),
    channel: text("channel", { enum: ["web", "whatsapp", "voice"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueSlot: uniqueIndex("reservations_tenant_phone_slot_unique").on(
      table.tenantId,
      table.customerPhone,
      table.reservedDate,
      table.reservedTime,
    ),
  }),
);

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
