import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Agendas Google connectés par tenant (import des créneaux occupés, V3).
 *
 * Une ligne = un agenda relié en OAuth. La sync importe les créneaux occupés
 * comme events `calendar.event.imported` → évite les doubles réservations.
 * Sens Google → OKITO uniquement pour l'instant (l'export viendra).
 *
 * Sécurité : les tokens ne sortent JAMAIS par l'API — les routes admin
 * renvoient l'agenda sans les colonnes token.
 */
export const tenantCalendars = pgTable(
  "tenant_calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Ressource agenda Google (ex : "primary"). */
    calendarId: text("calendar_id").notNull(),
    /** Nom d'affichage de l'agenda. */
    calendarSummary: text("calendar_summary").notNull(),

    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),

    /** Curseur de sync : `updated` du dernier event importé. */
    eventsCursor: timestamp("events_cursor", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Dernière erreur de sync (affichée dans le dashboard) ; null si tout va bien. */
    lastError: text("last_error"),

    status: text("status", { enum: ["active", "paused", "error"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tenant_calendars_tenant_idx").on(t.tenantId),
    uniqueIndex("tenant_calendars_calendar_uniq").on(t.tenantId, t.calendarId),
  ],
);

export type TenantCalendar = typeof tenantCalendars.$inferSelect;
export type NewTenantCalendar = typeof tenantCalendars.$inferInsert;
