import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const tenantPhoneRoutes = pgTable(
  "tenant_phone_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull().unique(),
    channel: text("channel", { enum: ["whatsapp", "voice"] }).notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    phoneLookup: index("idx_phone_routes_lookup").on(table.phoneNumber, table.channel),
  }),
);

export type TenantPhoneRoute = typeof tenantPhoneRoutes.$inferSelect;
export type NewTenantPhoneRoute = typeof tenantPhoneRoutes.$inferInsert;
