import { boolean, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Connecteurs tiers signés installés par tenant (marketplace, vague 5).
 *
 * Un connecteur est décrit par un manifest JSON signé Ed25519 par un éditeur
 * de confiance (registre de clés publiques côté OKITO). À l'installation on
 * vérifie la signature puis on génère un secret partagé propre au tenant :
 * chaque exécution (action Jarvis `ext.<connectorId>`) est POSTée sur
 * l'endpoint du connecteur, signée HMAC-SHA256 avec ce secret.
 */
export const tenantConnectors = pgTable(
  "tenant_connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Identifiant du connecteur dans son manifest (slug éditeur). */
    connectorId: text("connector_id").notNull(),
    name: text("name").notNull(),
    publisher: text("publisher").notNull(),
    version: text("version").notNull(),
    endpoint: text("endpoint").notNull(),
    /** Manifest complet tel que signé (source de vérité pour l'affichage). */
    manifest: jsonb("manifest").notNull().$type<Record<string, unknown>>(),
    /** Secret HMAC partagé avec le connecteur, généré à l'installation. */
    sharedSecret: text("shared_secret").notNull(),
    enabled: boolean("enabled").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tenant_connectors_tenant_idx").on(t.tenantId),
    unique("tenant_connectors_tenant_connector_uniq").on(t.tenantId, t.connectorId),
  ],
);

export type TenantConnector = typeof tenantConnectors.$inferSelect;
export type NewTenantConnector = typeof tenantConnectors.$inferInsert;
