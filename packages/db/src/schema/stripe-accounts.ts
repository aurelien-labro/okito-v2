import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Comptes Stripe du commerce par tenant (ingestion des encaissements, V3).
 *
 * Une ligne = un compte Stripe relié par clé secrète restreinte, chiffrée au
 * repos (AES-256-GCM). La sync ingère les nouveaux paiements comme events
 * `payment.received` → chiffre du jour + TVA collectée + journal de Jarvis.
 *
 * Sécurité : la clé (`secretKeyEnc`) ne sort JAMAIS par l'API — les routes
 * admin renvoient le compte sans cette colonne.
 */
export const tenantStripeAccounts = pgTable(
  "tenant_stripe_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Libellé d'affichage (v1 : "Stripe"). */
    accountLabel: text("account_label").notNull().default("Stripe"),
    /** Clé secrète restreinte chiffrée AES-256-GCM (jamais exposée). */
    secretKeyEnc: text("secret_key_enc").notNull(),

    /** Curseur de sync : `created` du dernier paiement ingéré. */
    chargeCursor: timestamp("charge_cursor", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Dernière erreur de sync (affichée dans le dashboard) ; null si tout va bien. */
    lastError: text("last_error"),

    status: text("status", { enum: ["active", "paused", "error"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenant_stripe_accounts_tenant_idx").on(t.tenantId)],
);

export type TenantStripeAccount = typeof tenantStripeAccounts.$inferSelect;
export type NewTenantStripeAccount = typeof tenantStripeAccounts.$inferInsert;
