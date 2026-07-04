import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Boîtes email connectées par tenant (ingestion Jarvis, V3).
 *
 * Une ligne = une boîte Gmail reliée en OAuth. Le refresh_token permet de
 * renouveler l'access_token sans re-consentement ; historyId est le curseur
 * de synchronisation incrémentale de l'API Gmail (users.history.list).
 *
 * Sécurité : les tokens ne sortent JAMAIS par l'API — les routes admin
 * renvoient la boîte sans les colonnes token.
 */
export const tenantMailboxes = pgTable(
  "tenant_mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    provider: text("provider").notNull().default("gmail"),
    /** Adresse de la boîte connectée (renseignée après l'échange OAuth). */
    emailAddress: text("email_address").notNull(),

    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),

    /** Curseur Gmail users.history.list — null tant qu'aucune sync n'a eu lieu. */
    historyId: text("history_id"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Dernière erreur de sync (affichée dans le dashboard) ; null si tout va bien. */
    lastError: text("last_error"),

    status: text("status", { enum: ["active", "paused", "error"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenant_mailboxes_tenant_idx").on(t.tenantId)],
);

export type TenantMailbox = typeof tenantMailboxes.$inferSelect;
export type NewTenantMailbox = typeof tenantMailboxes.$inferInsert;
