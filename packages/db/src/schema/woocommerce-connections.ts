import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Boutiques WooCommerce reliées par tenant (ventes en ligne, V3).
 *
 * Une ligne = une boutique WordPress reliée par clés REST API WooCommerce
 * (consumer key + secret), chiffrées ensemble au repos (AES-256-GCM). La sync
 * ingère les nouvelles commandes comme events `woocommerce.order` → CA en
 * ligne + TVA dans le journal de Jarvis.
 *
 * Sécurité : les clés (`credentialsEnc`) ne sortent JAMAIS par l'API — les
 * routes admin renvoient la connexion sans cette colonne.
 */
export const tenantWoocommerceConnections = pgTable(
  "tenant_woocommerce_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** URL racine de la boutique (ex: "https://boutique.fr"). */
    storeUrl: text("store_url").notNull(),
    /** Libellé d'affichage (v1 : hostname de la boutique). */
    storeLabel: text("store_label").notNull().default("Boutique WooCommerce"),
    /** JSON { consumerKey, consumerSecret } chiffré AES-256-GCM (jamais exposé). */
    credentialsEnc: text("credentials_enc").notNull(),

    /** Curseur de sync : date de création de la dernière commande ingérée. */
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
    index("tenant_woocommerce_connections_tenant_idx").on(t.tenantId),
    unique().on(t.tenantId, t.storeUrl),
  ],
);

export type TenantWoocommerceConnection = typeof tenantWoocommerceConnections.$inferSelect;
export type NewTenantWoocommerceConnection = typeof tenantWoocommerceConnections.$inferInsert;
