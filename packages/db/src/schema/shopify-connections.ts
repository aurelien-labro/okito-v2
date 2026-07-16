import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Boutiques Shopify reliées par tenant (ventes en ligne, V3).
 *
 * Une ligne = une boutique reliée par jeton Admin API (custom app), chiffré
 * au repos (AES-256-GCM). La sync ingère les nouvelles commandes comme events
 * `shopify.order` → CA en ligne + TVA dans le journal de Jarvis.
 *
 * Sécurité : le jeton (`accessTokenEnc`) ne sort JAMAIS par l'API — les
 * routes admin renvoient la connexion sans cette colonne.
 */
export const tenantShopifyConnections = pgTable(
  "tenant_shopify_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Domaine myshopify (ex: "ma-boutique.myshopify.com"). */
    shopDomain: text("shop_domain").notNull(),
    /** Libellé d'affichage : nom de la boutique renvoyé par /shop.json. */
    shopLabel: text("shop_label").notNull().default("Boutique Shopify"),
    /** Jeton Admin API chiffré AES-256-GCM (jamais exposé). */
    accessTokenEnc: text("access_token_enc").notNull(),

    /** Curseur de sync : created_at de la dernière commande ingérée. */
    orderCursor: timestamp("order_cursor", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Dernière erreur de sync (affichée dans le dashboard) ; null si tout va bien. */
    lastError: text("last_error"),

    status: text("status", { enum: ["active", "paused", "error"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tenant_shopify_connections_tenant_idx").on(t.tenantId),
    unique().on(t.tenantId, t.shopDomain),
  ],
);

export type TenantShopifyConnection = typeof tenantShopifyConnections.$inferSelect;
export type NewTenantShopifyConnection = typeof tenantShopifyConnections.$inferInsert;
