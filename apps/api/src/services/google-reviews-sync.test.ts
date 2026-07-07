import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { EventBusService } from "./event-bus.js";
import type { GoogleBusinessService, GoogleReview } from "./google-business.js";
import { GoogleReviewsSyncService } from "./google-reviews-sync.js";

function review(name: string, updateTime: string, rating = 3): GoogleReview {
  return {
    name,
    rating,
    comment: null,
    reviewerName: "Client",
    hasReply: false,
    updateTime: new Date(updateTime),
  };
}

describe("GoogleReviewsSyncService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-gbp-sync", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function seedConnection(reviewCursor: Date | null, status = "active") {
    const [conn] = await ctx.db
      .insert(schema.tenantGoogleBusiness)
      .values({
        tenantId,
        accountName: "accounts/1",
        locationName: "locations/1",
        locationTitle: "Fiche",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        reviewCursor,
        status: status as "active",
      })
      .returning();
    if (!conn) throw new Error("connection insert failed");
    return conn;
  }

  async function events() {
    return ctx.db.select().from(schema.events).where(eq(schema.events.tenantId, tenantId));
  }

  it("première sync : bootstrap du curseur, aucun avis ingéré", async () => {
    const conn = await seedConnection(null);
    const gbp = {
      listReviews: vi
        .fn()
        .mockResolvedValue([
          review("r/A", "2026-07-01T10:00:00Z"),
          review("r/B", "2026-07-02T10:00:00Z"),
        ]),
    } as unknown as GoogleBusinessService;
    const sync = new GoogleReviewsSyncService(ctx.db, gbp, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ connectionsProcessed: 1, reviewsIngested: 0, errors: 0 });
    expect(await events()).toHaveLength(0);
    const [row] = await ctx.db
      .select()
      .from(schema.tenantGoogleBusiness)
      .where(eq(schema.tenantGoogleBusiness.id, conn.id));
    // curseur posé au plus récent des avis
    expect(row?.reviewCursor?.toISOString()).toBe("2026-07-02T10:00:00.000Z");
  });

  it("sync incrémentale : publie google.review.submitted pour les avis plus récents que le curseur", async () => {
    const conn = await seedConnection(new Date("2026-07-01T00:00:00Z"));
    const gbp = {
      listReviews: vi.fn().mockResolvedValue([
        review("r/OLD", "2026-06-30T10:00:00Z", 5), // avant curseur → ignoré
        review("r/NEW", "2026-07-05T10:00:00Z", 2),
      ]),
    } as unknown as GoogleBusinessService;
    const sync = new GoogleReviewsSyncService(ctx.db, gbp, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ reviewsIngested: 1, errors: 0 });
    await new Promise((r) => setTimeout(r, 30));
    const evs = await events();
    expect(evs).toHaveLength(1);
    expect(evs[0]?.type).toBe("google.review.submitted");
    expect(evs[0]?.payload).toMatchObject({
      googleReviewName: "r/NEW",
      rating: 2,
      connectionId: conn.id,
    });
  });

  it("une connexion en erreur n'empêche pas les autres", async () => {
    await seedConnection(new Date("2026-07-01T00:00:00Z"));
    const gbp = {
      listReviews: vi.fn().mockRejectedValue(new Error("HTTP 500")),
    } as unknown as GoogleBusinessService;
    const sync = new GoogleReviewsSyncService(ctx.db, gbp, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ connectionsProcessed: 1, errors: 1 });
    const [row] = await ctx.db.select().from(schema.tenantGoogleBusiness);
    expect(row?.status).toBe("error");
    expect(row?.lastError).toContain("HTTP 500");
  });

  it("ignore les connexions non-actives", async () => {
    await seedConnection(new Date("2026-07-01T00:00:00Z"), "paused");
    const gbp = { listReviews: vi.fn() } as unknown as GoogleBusinessService;
    const sync = new GoogleReviewsSyncService(ctx.db, gbp, new EventBusService(ctx.db));

    const result = await sync.runOnce();
    expect(result.connectionsProcessed).toBe(0);
  });
});
