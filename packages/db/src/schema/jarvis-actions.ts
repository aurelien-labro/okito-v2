import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Actions de l'agent Jarvis, avec garde-fous (fondation V3).
 *
 * Chaque action proposée par Jarvis passe par un cycle de vie gouverné par
 * une politique par type d'action :
 *   - "auto"             : exécutable immédiatement
 *   - "auto_cancellable" : exécutable, mais annulable par le patron jusqu'à
 *                          cancellable_until (fenêtre de retrait)
 *   - "approval"         : bloquée tant que le patron ne valide pas
 *
 * Statuts : scheduled → executed | cancelled | failed
 *           awaiting_approval → scheduled (après approve) | cancelled
 *
 * Types standardisés : "<entity>.<verb>" (ex: "review.reply",
 * "invoice.remind"), même convention que events et audit_log.
 */
export const JARVIS_POLICIES = ["auto", "auto_cancellable", "approval"] as const;
export type JarvisPolicy = (typeof JARVIS_POLICIES)[number];

export const JARVIS_ACTION_STATUSES = [
  "awaiting_approval",
  "scheduled",
  "executed",
  "cancelled",
  "failed",
] as const;
export type JarvisActionStatus = (typeof JARVIS_ACTION_STATUSES)[number];

export const jarvisActions = pgTable(
  "jarvis_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    type: text("type").notNull(),
    /** Résumé lisible pour le patron ("Relance facture n°247 — 890 €"). */
    summary: text("summary").notNull(),
    policy: text("policy", { enum: JARVIS_POLICIES }).notNull(),
    status: text("status", { enum: JARVIS_ACTION_STATUSES }).notNull(),

    /** Input du tool à exécuter (contrat propre à chaque type d'action). */
    payload: jsonb("payload").notNull().default({}),
    /** Résultat d'exécution ou erreur (si failed). */
    result: jsonb("result"),

    /** Fin de la fenêtre de retrait (policy auto_cancellable uniquement). */
    cancellableUntil: timestamp("cancellable_until", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    index("jarvis_actions_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("jarvis_actions_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export type JarvisAction = typeof jarvisActions.$inferSelect;
export type NewJarvisAction = typeof jarvisActions.$inferInsert;
