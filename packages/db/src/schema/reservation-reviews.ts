import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { reservations } from "./reservations.js";
import { tenants } from "./tenants.js";

export const reservationReviews = pgTable(
  "reservation_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePerReservation: uniqueIndex("reservation_reviews_reservation_uniq").on(t.reservationId),
  }),
);

export type ReservationReview = typeof reservationReviews.$inferSelect;
export type NewReservationReview = typeof reservationReviews.$inferInsert;
