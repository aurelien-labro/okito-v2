import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const tenantServiceCatalog = pgTable(
  "tenant_service_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    priceCents: integer("price_cents"),
    currency: text("currency").notNull().default("EUR"),
    active: boolean("active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    /** Attributs métier libres définis par le tenant (vertical-specific). */
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueNamePerTenant: uniqueIndex("tenant_service_catalog_tenant_name_uniq").on(
      t.tenantId,
      t.name,
    ),
  }),
);

export type ServiceCatalogItem = typeof tenantServiceCatalog.$inferSelect;
export type NewServiceCatalogItem = typeof tenantServiceCatalog.$inferInsert;
