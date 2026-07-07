import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Connexions bancaires du commerce par tenant (rapprochement TVA, V3).
 *
 * Une ligne = un accès à un agrégateur (Bridge / Powens) relié par jeton,
 * chiffré au repos (AES-256-GCM). La sync ingère les nouvelles transactions
 * comme events `bank.transaction` → rapprochement facture ↔ encaissement.
 *
 * Sécurité : le jeton (`accessTokenEnc`) ne sort JAMAIS par l'API — les
 * routes admin renvoient la connexion sans cette colonne.
 */
export const tenantBankConnections = pgTable(
  "tenant_bank_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Agrégateur : "bridge", "powens"… */
    provider: text("provider").notNull().default("bridge"),
    /** Libellé d'affichage (v1 : "Banque"). */
    accountLabel: text("account_label").notNull().default("Banque"),
    /** Jeton d'accès chiffré AES-256-GCM (jamais exposé). */
    accessTokenEnc: text("access_token_enc").notNull(),

    /** Curseur de sync : date de la dernière transaction ingérée. */
    transactionCursor: timestamp("transaction_cursor", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Dernière erreur de sync (affichée dans le dashboard) ; null si tout va bien. */
    lastError: text("last_error"),

    status: text("status", { enum: ["active", "paused", "error"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenant_bank_connections_tenant_idx").on(t.tenantId)],
);

export type TenantBankConnection = typeof tenantBankConnections.$inferSelect;
export type NewTenantBankConnection = typeof tenantBankConnections.$inferInsert;
