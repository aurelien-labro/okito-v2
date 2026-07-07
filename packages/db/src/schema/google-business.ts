import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Connexions Google Business Profile par tenant (avis Google, V3).
 *
 * Une ligne = une fiche Google (location) reliée en OAuth. La sync ingère
 * les nouveaux avis comme events `google.review.submitted` ; l'Observer
 * propose une réponse (annulable 24h) que l'Executor publie via l'API.
 *
 * Sécurité : les tokens ne sortent JAMAIS par l'API — les routes admin
 * renvoient la connexion sans les colonnes token.
 */
export const tenantGoogleBusiness = pgTable(
  "tenant_google_business",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Ressource compte Google : "accounts/{id}". */
    accountName: text("account_name").notNull(),
    /** Ressource fiche : "locations/{id}". */
    locationName: text("location_name").notNull(),
    /** Nom d'affichage de la fiche (ex : "Boulangerie du Parc"). */
    locationTitle: text("location_title").notNull(),

    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),

    /** Curseur de sync : updateTime du dernier avis traité. */
    reviewCursor: timestamp("review_cursor", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Dernière erreur de sync (affichée dans le dashboard) ; null si tout va bien. */
    lastError: text("last_error"),

    status: text("status", { enum: ["active", "paused", "error"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tenant_google_business_tenant_idx").on(t.tenantId),
    uniqueIndex("tenant_google_business_location_uniq").on(t.tenantId, t.locationName),
  ],
);

export type TenantGoogleBusiness = typeof tenantGoogleBusiness.$inferSelect;
export type NewTenantGoogleBusiness = typeof tenantGoogleBusiness.$inferInsert;
