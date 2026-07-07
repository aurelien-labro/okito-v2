import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { CalendarSyncService } from "./calendar-sync.js";
import { EventBusService } from "./event-bus.js";
import type { CalendarBusyEvent, GoogleCalendarService } from "./google-calendar.js";

function busy(id: string, start: string, updated: string): CalendarBusyEvent {
  return {
    id,
    summary: "Occupé",
    start: new Date(start),
    end: new Date(new Date(start).getTime() + 3600_000),
    updated: new Date(updated),
  };
}

describe("CalendarSyncService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-cal-sync", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function seedCalendar(cursor: Date | null, status = "active") {
    const [row] = await ctx.db
      .insert(schema.tenantCalendars)
      .values({
        tenantId,
        calendarId: "primary",
        calendarSummary: "Agenda",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        eventsCursor: cursor,
        status: status as "active",
      })
      .returning();
    if (!row) throw new Error("calendar insert failed");
    return row;
  }

  async function events() {
    return ctx.db.select().from(schema.events).where(eq(schema.events.tenantId, tenantId));
  }

  function fakeCalendars(evts: CalendarBusyEvent[]): GoogleCalendarService {
    return {
      listBusyEventsSince: vi.fn().mockResolvedValue(evts),
    } as unknown as GoogleCalendarService;
  }

  it("publie calendar.event.imported et avance le curseur", async () => {
    const cal = await seedCalendar(new Date("2026-07-01T00:00:00Z"));
    const calendars = fakeCalendars([
      busy("e1", "2026-07-08T10:00:00Z", "2026-07-07T09:00:00Z"),
      busy("e2", "2026-07-09T10:00:00Z", "2026-07-07T12:00:00Z"),
    ]);
    const sync = new CalendarSyncService(ctx.db, calendars, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ calendarsProcessed: 1, eventsImported: 2, errors: 0 });
    await new Promise((r) => setTimeout(r, 30));
    const evs = await events();
    expect(evs).toHaveLength(2);
    expect(evs.every((e) => e.type === "calendar.event.imported")).toBe(true);

    const [row] = await ctx.db
      .select()
      .from(schema.tenantCalendars)
      .where(eq(schema.tenantCalendars.id, cal.id));
    expect(row?.eventsCursor?.toISOString()).toBe("2026-07-07T12:00:00.000Z");
  });

  it("un agenda en erreur n'empêche pas les autres", async () => {
    await seedCalendar(new Date("2026-07-01T00:00:00Z"));
    const calendars = {
      listBusyEventsSince: vi.fn().mockRejectedValue(new Error("events.list HTTP 500")),
    } as unknown as GoogleCalendarService;
    const sync = new CalendarSyncService(ctx.db, calendars, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ calendarsProcessed: 1, errors: 1 });
    const [row] = await ctx.db.select().from(schema.tenantCalendars);
    expect(row?.status).toBe("error");
    expect(row?.lastError).toContain("HTTP 500");
  });

  it("ignore les agendas non-actifs", async () => {
    await seedCalendar(new Date("2026-07-01T00:00:00Z"), "paused");
    const sync = new CalendarSyncService(
      ctx.db,
      fakeCalendars([busy("e1", "2026-07-08T10:00:00Z", "2026-07-07T09:00:00Z")]),
      new EventBusService(ctx.db),
    );

    const result = await sync.runOnce();
    expect(result.calendarsProcessed).toBe(0);
    expect(await events()).toHaveLength(0);
  });
});
