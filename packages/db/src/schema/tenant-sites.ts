import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const SITE_STATUSES = ["draft", "published"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

/** Clés de blocs supportées par le rendu V1 (page unique). */
export const SITE_BLOCK_KEYS = ["hero", "offer", "info", "reviews", "contact"] as const;
export type SiteBlockKey = (typeof SITE_BLOCK_KEYS)[number];

export type SiteBlocks = Partial<Record<SiteBlockKey, Record<string, unknown>>>;
export interface SiteSeo {
  title?: string;
  description?: string;
}

/**
 * Site vitrine hébergé (vague 3 — site builder).
 *
 * Un site mono-page par tenant, composé de blocs jsonb. Servi publiquement
 * par slug ; seul un site `published` est visible.
 */
export const tenantSites = pgTable("tenant_sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),

  slug: text("slug").notNull().unique(),
  theme: text("theme").notNull().default("okito"),
  blocks: jsonb("blocks").$type<SiteBlocks>().notNull().default({}),
  seo: jsonb("seo").$type<SiteSeo>().notNull().default({}),

  status: text("status", { enum: SITE_STATUSES }).notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TenantSite = typeof tenantSites.$inferSelect;
export type NewTenantSite = typeof tenantSites.$inferInsert;
