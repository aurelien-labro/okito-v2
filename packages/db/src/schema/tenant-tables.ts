import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const tenantTables = pgTable(
  "tenant_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    capacity: integer("capacity").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueLabelPerTenant: uniqueIndex("tenant_tables_tenant_label_uniq").on(t.tenantId, t.label),
  }),
);

export type TenantTable = typeof tenantTables.$inferSelect;
export type NewTenantTable = typeof tenantTables.$inferInsert;
