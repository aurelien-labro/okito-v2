import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { adminStripeAnalyticsRoute } from "./admin-stripe.js";

describe("adminStripeAnalyticsRoute", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-stripe-analytics", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("somme les encaissements du jour et des 7 derniers jours", async () => {
    await ctx.db.insert(schema.events).values([
      { tenantId, type: "payment.received", source: "stripe", payload: { amountCents: 1500 } },
      { tenantId, type: "payment.received", source: "stripe", payload: { amountCents: 4200 } },
      {
        tenantId,
        type: "payment.received",
        source: "stripe",
        payload: { amountCents: 1000 },
        createdAt: new Date(Date.now() - 3 * 24 * 3600_000),
      },
      {
        tenantId,
        type: "payment.received",
        source: "stripe",
        payload: { amountCents: 9999 },
        createdAt: new Date(Date.now() - 30 * 24 * 3600_000),
      },
      // Un autre type d'event ne compte pas.
      { tenantId, type: "site.visit", source: "site", payload: { path: "/" } },
    ]);
    const app = adminStripeAnalyticsRoute(ctx.db);

    const res = await app.request(`/${tenantId}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { todayCents: number; last7DaysCents: number };
    };
    expect(body.data).toEqual({ todayCents: 5700, last7DaysCents: 6700 });
  });

  it("tenant sans paiement : zéros", async () => {
    const app = adminStripeAnalyticsRoute(ctx.db);
    const res = await app.request(`/${tenantId}`);
    const body = (await res.json()) as {
      data: { todayCents: number; last7DaysCents: number };
    };
    expect(body.data).toEqual({ todayCents: 0, last7DaysCents: 0 });
  });

  it("400 sur tenantId non-UUID", async () => {
    const app = adminStripeAnalyticsRoute(ctx.db);
    const res = await app.request("/pas-un-uuid");
    expect(res.status).toBe(400);
  });
});
