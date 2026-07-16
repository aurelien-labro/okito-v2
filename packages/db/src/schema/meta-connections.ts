import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Comptes Meta (Facebook & Instagram) reliés par tenant (publicité, V3).
 *
 * Une ligne = un compte relié en OAuth Meta. Pas de refresh token côté Meta :
 * un token long-lived (~60 j), renouvelé à la reconnexion. v1 = connexion +
 * gestion ; l'ingestion des dépenses Meta Ads et le canal Instagram/Messenger
 * viendront dans leurs propres itérations.
 *
 * Sécurité : le token ne sort JAMAIS par l'API — les routes admin renvoient
 * la connexion sans la colonne token.
 */
export const tenantMetaConnections = pgTable(
  "tenant_meta_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Id du compte Meta connecté (utilisateur ou business). */
    externalAccountId: text("external_account_id").notNull(),
    /** Libellé d'affichage : nom du compte Meta. */
    accountLabel: text("account_label").notNull().default("Meta Ads"),

    accessToken: text("access_token").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),

    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Dernière erreur (affichée dans le dashboard) ; null si tout va bien. */
    lastError: text("last_error"),

    status: text("status", { enum: ["active", "paused", "error"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tenant_meta_connections_tenant_idx").on(t.tenantId),
    unique().on(t.tenantId, t.externalAccountId),
  ],
);

export type TenantMetaConnection = typeof tenantMetaConnections.$inferSelect;
export type NewTenantMetaConnection = typeof tenantMetaConnections.$inferInsert;
