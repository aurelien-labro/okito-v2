import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Profil vocal cloné par tenant (voice cloning, vague 4).
 *
 * Une ligne = un clone ElevenLabs actif pour le tenant, avec la preuve de
 * consentement (qui a consenti, quel texte, quand). Pas de ligne = le
 * pipeline voix parle avec la voix par défaut (ELEVENLABS_VOICE_ID).
 */
export const tenantVoiceProfiles = pgTable(
  "tenant_voice_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    voiceId: text("voice_id").notNull(),
    label: text("label").notNull().default("Voix du patron"),

    consentGivenBy: text("consent_given_by").notNull(),
    consentText: text("consent_text").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),

    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("tenant_voice_profiles_tenant_uniq").on(t.tenantId)],
);

export type TenantVoiceProfile = typeof tenantVoiceProfiles.$inferSelect;
export type NewTenantVoiceProfile = typeof tenantVoiceProfiles.$inferInsert;
