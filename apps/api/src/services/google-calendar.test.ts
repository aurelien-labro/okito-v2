import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { GoogleCalendarService } from "./google-calendar.js";

const OAUTH = {
  clientId: "cid",
  clientSecret: "secret",
  redirectUri: "http://localhost:3001/oauth/google-calendar/callback",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GoogleCalendarService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-cal", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function rows() {
    return ctx.db
      .select()
      .from(schema.tenantCalendars)
      .where(eq(schema.tenantCalendars.tenantId, tenantId));
  }

  it("buildAuthUrl : scope calendar.readonly + state", () => {
    const svc = new GoogleCalendarService(ctx.db, OAUTH);
    const { url, state } = svc.buildAuthUrl(tenantId);
    expect(url).toContain("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly");
    expect(url).toContain(`state=${state}`);
    expect(url).toContain("access_type=offline");
  });

  it("handleCallback : échange le code, résout l'agenda primary, bootstrap le curseur", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "primary", summary: "Agenda pro" }));
    const svc = new GoogleCalendarService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);
    const now = new Date("2026-07-06T10:00:00Z");

    const { state } = svc.buildAuthUrl(tenantId);
    const safe = await svc.handleCallback("code-1", state, now);

    expect(safe).toMatchObject({
      calendarId: "primary",
      calendarSummary: "Agenda pro",
      status: "active",
    });
    expect(safe).not.toHaveProperty("accessToken");
    expect(safe.eventsCursor?.toISOString()).toBe(now.toISOString());

    const [row] = await rows();
    expect(row?.refreshToken).toBe("rt");
  });

  it("handleCallback : state inconnu → erreur", async () => {
    const svc = new GoogleCalendarService(ctx.db, OAUTH);
    await expect(svc.handleCallback("code", "bidon")).rejects.toThrow(/state/i);
  });

  it("listBusyEventsSince : garde les créneaux occupants, ignore annulés/transparents/journées sans heure valide", async () => {
    const [cal] = await ctx.db
      .insert(schema.tenantCalendars)
      .values({
        tenantId,
        calendarId: "primary",
        calendarSummary: "Agenda",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      })
      .returning();
    if (!cal) throw new Error("insert failed");

    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: "e1",
            status: "confirmed",
            summary: "Rdv fournisseur",
            start: { dateTime: "2026-07-08T10:00:00Z" },
            end: { dateTime: "2026-07-08T11:00:00Z" },
            updated: "2026-07-07T09:00:00Z",
          },
          {
            id: "e2",
            status: "confirmed",
            transparency: "transparent", // dispo → ignoré
            start: { dateTime: "2026-07-08T14:00:00Z" },
            end: { dateTime: "2026-07-08T15:00:00Z" },
            updated: "2026-07-07T09:30:00Z",
          },
          { id: "e3", status: "cancelled", updated: "2026-07-07T10:00:00Z" },
        ],
      }),
    );
    const svc = new GoogleCalendarService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);

    const events = await svc.listBusyEventsSince(
      cal.id,
      "primary",
      new Date("2026-07-01T00:00:00Z"),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: "e1", summary: "Rdv fournisseur" });
    expect(events[0]?.start.toISOString()).toBe("2026-07-08T10:00:00.000Z");
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain("updatedMin=2026-07-01T00%3A00%3A00.000Z");
  });

  it("getFreshAccessToken : renouvelle quand expiré", async () => {
    const [cal] = await ctx.db
      .insert(schema.tenantCalendars)
      .values({
        tenantId,
        calendarId: "primary",
        calendarSummary: "Agenda",
        accessToken: "vieux",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() - 1000),
      })
      .returning();
    if (!cal) throw new Error("insert failed");

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "neuf", expires_in: 3600 }));
    const svc = new GoogleCalendarService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);

    expect(await svc.getFreshAccessToken(cal.id)).toBe("neuf");
    const [row] = await rows();
    expect(row?.accessToken).toBe("neuf");
  });

  it("list/setStatus/remove : cycle sans exposer les tokens", async () => {
    const svc = new GoogleCalendarService(ctx.db, OAUTH);
    const [cal] = await ctx.db
      .insert(schema.tenantCalendars)
      .values({
        tenantId,
        calendarId: "primary",
        calendarSummary: "Agenda",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      })
      .returning();
    if (!cal) throw new Error("insert failed");

    const listed = await svc.list(tenantId);
    expect(listed[0]).not.toHaveProperty("accessToken");
    const paused = await svc.setStatus(tenantId, cal.id, "paused");
    expect(paused.status).toBe("paused");
    await svc.remove(tenantId, cal.id);
    expect(await rows()).toHaveLength(0);
  });
});
