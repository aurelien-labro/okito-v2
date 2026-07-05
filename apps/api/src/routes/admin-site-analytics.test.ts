import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { adminSiteAnalyticsRoute } from "./admin-site-analytics.js";

describe("adminSiteAnalyticsRoute", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-analytics", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("compte les visites du jour et des 7 derniers jours", async () => {
    await ctx.db.insert(schema.events).values([
      { tenantId, type: "site.visit", source: "site", payload: { path: "/" } },
      { tenantId, type: "site.visit", source: "site", payload: { path: "/menu" } },
      {
        tenantId,
        type: "site.visit",
        source: "site",
        payload: { path: "/" },
        createdAt: new Date(Date.now() - 3 * 24 * 3600_000),
      },
      {
        tenantId,
        type: "site.visit",
        source: "site",
        payload: { path: "/" },
        createdAt: new Date(Date.now() - 30 * 24 * 3600_000),
      },
      // Un autre type d'event ne compte pas.
      { tenantId, type: "reservation.created", payload: { id: "r1" } },
    ]);
    const app = adminSiteAnalyticsRoute(ctx.db);

    const res = await app.request(`/${tenantId}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { today: number; last7Days: number } };
    expect(body.data).toEqual({ today: 2, last7Days: 3 });
  });

  it("tenant sans visites : zéros", async () => {
    const app = adminSiteAnalyticsRoute(ctx.db);
    const res = await app.request(`/${tenantId}`);
    const body = (await res.json()) as { data: { today: number; last7Days: number } };
    expect(body.data).toEqual({ today: 0, last7Days: 0 });
  });

  it("400 sur tenantId non-UUID", async () => {
    const app = adminSiteAnalyticsRoute(ctx.db);
    const res = await app.request("/pas-un-uuid");
    expect(res.status).toBe(400);
  });
});
