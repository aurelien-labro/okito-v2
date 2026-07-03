import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { DuplicateReviewError, ReviewService } from "./review.js";

describe("ReviewService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let svc: ReviewService;
  let tenantId: string;

  async function makeResa() {
    const [r] = await ctx.db
      .insert(schema.reservations)
      .values({
        tenantId,
        customerName: "Emma",
        customerPhone: `06${Math.floor(Math.random() * 1e8)}`,
        couverts: 2,
        dateReservation: "2026-07-01",
        heure: "20:00",
      })
      .returning();
    if (!r) throw new Error("resa insert failed");
    return r.id;
  }

  beforeEach(async () => {
    ctx = await createTestDb();
    svc = new ReviewService(ctx.db);
    const [t] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-rev", name: "Resto" })
      .returning();
    if (!t) throw new Error("tenant insert failed");
    tenantId = t.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("submit + getByReservation", async () => {
    const resId = await makeResa();
    const review = await svc.submit({ tenantId, reservationId: resId, rating: 5, comment: "Top" });
    expect(review.rating).toBe(5);
    const fetched = await svc.getByReservation(resId);
    expect(fetched?.comment).toBe("Top");
  });

  it("un seul avis par réservation", async () => {
    const resId = await makeResa();
    await svc.submit({ tenantId, reservationId: resId, rating: 4 });
    await expect(svc.submit({ tenantId, reservationId: resId, rating: 2 })).rejects.toBeInstanceOf(
      DuplicateReviewError,
    );
  });

  it("summary : moyenne arrondie + récents", async () => {
    const r1 = await makeResa();
    const r2 = await makeResa();
    const r3 = await makeResa();
    await svc.submit({ tenantId, reservationId: r1, rating: 5, comment: "A" });
    await svc.submit({ tenantId, reservationId: r2, rating: 4, comment: "B" });
    await svc.submit({ tenantId, reservationId: r3, rating: 3 });

    const summary = await svc.summary(tenantId);
    expect(summary.count).toBe(3);
    expect(summary.average).toBe(4);
    expect(summary.recent).toHaveLength(3);
  });

  it("summary vide → count 0, average 0", async () => {
    const summary = await svc.summary(tenantId);
    expect(summary.count).toBe(0);
    expect(summary.average).toBe(0);
    expect(summary.recent).toEqual([]);
  });
});
