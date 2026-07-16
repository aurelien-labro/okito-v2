import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const CAMPAIGN_CHANNELS = ["email", "whatsapp"] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

/**
 * Segments clients, calculés à la volée depuis les réservations :
 * - all      : tous les clients connus (résa confirmed/completed)
 * - regulars : habitués (3+ visites)
 * - recent   : venus dans les 30 derniers jours
 * - dormant  : pas venus depuis plus de 60 jours
 */
export const CAMPAIGN_SEGMENTS = ["all", "regulars", "recent", "dormant"] as const;
export type CampaignSegment = (typeof CAMPAIGN_SEGMENTS)[number];

/**
 * Campagnes marketing par tenant (vague 3).
 *
 * Une ligne = une campagne email ou WhatsApp vers un segment. Les compteurs
 * (destinataires, envoyés, échecs) sont figés au moment de l'envoi.
 */
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    channel: text("channel", { enum: CAMPAIGN_CHANNELS }).notNull(),
    segment: text("segment", { enum: CAMPAIGN_SEGMENTS }).notNull(),
    /** Sujet requis pour l'email, ignoré pour WhatsApp. */
    subject: text("subject"),
    body: text("body").notNull(),

    status: text("status", { enum: ["draft", "sent"] })
      .notNull()
      .default("draft"),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("campaigns_tenant_idx").on(t.tenantId)],
);

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
