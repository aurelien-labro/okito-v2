import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Comptes Google Ads reliés par tenant (publicité, V3).
 *
 * Une ligne = un compte relié en OAuth (scope adwords). v1 = connexion +
 * gestion ; l'ingestion des dépenses/conversions viendra dans sa propre
 * itération (developer token Google Ads requis).
 *
 * Sécurité : les tokens ne sortent JAMAIS par l'API — les routes admin
 * renvoient la connexion sans les colonnes token.
 */
export const tenantGoogleAdsConnections = pgTable(
  "tenant_google_ads_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Libellé d'affichage (v1 : "Google Ads"). */
    accountLabel: text("account_label").notNull().default("Google Ads"),

    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),

    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Dernière erreur (affichée dans le dashboard) ; null si tout va bien. */
    lastError: text("last_error"),

    status: text("status", { enum: ["active", "paused", "error"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenant_google_ads_connections_tenant_idx").on(t.tenantId)],
);

export type TenantGoogleAdsConnection = typeof tenantGoogleAdsConnections.$inferSelect;
export type NewTenantGoogleAdsConnection = typeof tenantGoogleAdsConnections.$inferInsert;
