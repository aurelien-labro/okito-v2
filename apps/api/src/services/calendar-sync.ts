import { type Database, schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";
import type { GoogleCalendarService } from "./google-calendar.js";

export interface CalendarSyncRunResult {
  calendarsProcessed: number;
  eventsImported: number;
  errors: number;
}

/**
 * Synchronisation des agendas Google → event bus (V3).
 *
 * Par agenda actif : importe les créneaux occupés modifiés depuis le curseur,
 * publie un event `calendar.event.imported` par créneau (utilisé pour bloquer
 * la disponibilité et éviter les doubles réservations). Bootstrap du curseur
 * à la connexion. Isolation par agenda.
 */
export class CalendarSyncService {
  constructor(
    private readonly db: Database,
    private readonly calendars: GoogleCalendarService,
    private readonly bus: EventBusService,
  ) {}

  async runOnce(): Promise<CalendarSyncRunResult> {
    const result: CalendarSyncRunResult = { calendarsProcessed: 0, eventsImported: 0, errors: 0 };

    const rows = await this.db
      .select()
      .from(schema.tenantCalendars)
      .where(eq(schema.tenantCalendars.status, "active"));

    for (const cal of rows) {
      result.calendarsProcessed++;
      try {
        result.eventsImported += await this.syncCalendar(cal.id, cal.tenantId);
      } catch (err) {
        result.errors++;
        const message = err instanceof Error ? err.message : String(err);
        await this.db
          .update(schema.tenantCalendars)
          .set({ status: "error", lastError: message })
          .where(eq(schema.tenantCalendars.id, cal.id));
        logger.error({ err, calendarId: cal.id }, "Calendar sync: agenda en erreur");
      }
    }
    return result;
  }

  private async syncCalendar(calendarRowId: string, tenantId: string): Promise<number> {
    const cal = await this.db.query.tenantCalendars.findFirst({
      where: (c, { eq: e }) => e(c.id, calendarRowId),
    });
    if (!cal) return 0;

    const since = cal.eventsCursor ?? new Date(0);
    const events = await this.calendars.listBusyEventsSince(cal.id, cal.calendarId, since);

    let cursor = cal.eventsCursor;
    let imported = 0;
    for (const event of events) {
      this.bus.publish(
        tenantId,
        "calendar.event.imported",
        {
          googleEventId: event.id,
          summary: event.summary,
          startsAt: event.start.toISOString(),
          endsAt: event.end.toISOString(),
          calendarRowId,
        },
        "google_calendar",
      );
      imported++;
      if (!cursor || event.updated > cursor) cursor = event.updated;
    }

    await this.db
      .update(schema.tenantCalendars)
      .set({ eventsCursor: cursor, lastSyncAt: new Date(), lastError: null })
      .where(eq(schema.tenantCalendars.id, calendarRowId));
    return imported;
  }
}
