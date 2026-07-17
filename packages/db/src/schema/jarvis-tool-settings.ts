import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { JARVIS_POLICIES } from "./jarvis-actions.js";
import { tenants } from "./tenants.js";

/**
 * Réglages par tenant des tools Jarvis (boutique d'automatisations, vague 4).
 *
 * Une ligne par (tenant, tool) UNIQUEMENT quand le patron s'écarte du défaut :
 * pas de ligne = tool actif avec la policy par défaut du code. `enabled=false`
 * coupe la boucle (plus de proposition, filet de sécurité à l'exécution) ;
 * `policy_override` force auto / auto_cancellable / approval.
 */
export const jarvisToolSettings = pgTable(
  "jarvis_tool_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    toolType: text("tool_type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    policyOverride: text("policy_override", { enum: JARVIS_POLICIES }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jarvis_tool_settings_tenant_idx").on(t.tenantId),
    unique("jarvis_tool_settings_tenant_tool_uniq").on(t.tenantId, t.toolType),
  ],
);

export type JarvisToolSetting = typeof jarvisToolSettings.$inferSelect;
export type NewJarvisToolSetting = typeof jarvisToolSettings.$inferInsert;
