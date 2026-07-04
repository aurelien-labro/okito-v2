import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { JarvisActionService } from "./jarvis-action.js";
import { JarvisObserverService } from "./jarvis-observer.js";

describe("JarvisObserverService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let actions: JarvisActionService;
  let observer: JarvisObserverService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-observer", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    actions = new JarvisActionService(ctx.db);
    observer = new JarvisObserverService(ctx.db, actions);
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function submitReviewEvent(reviewId: string, rating: number, comment?: string) {
    await ctx.db.insert(schema.events).values({
      tenantId,
      type: "review.submitted",
      payload: { reviewId, reservationId: "res-1", rating, comment: comment ?? null },
    });
  }

  it("avis négatif → propose review.reply (auto_cancellable)", async () => {
    await submitReviewEvent("rev-1", 2, "Service très lent, déçu.");

    const result = await observer.runOnce();

    expect(result).toMatchObject({ eventsScanned: 1, actionsProposed: 1 });
    const [action] = await actions.list(tenantId);
    expect(action).toMatchObject({
      type: "review.reply",
      policy: "auto_cancellable",
      status: "scheduled",
      payload: { reviewId: "rev-1", rating: 2 },
    });
    expect(action?.summary).toContain("2★");
    expect(action?.summary).toContain("Service très lent");
  });

  it("avis positif : aucune action", async () => {
    await submitReviewEvent("rev-2", 5, "Parfait !");
    const result = await observer.runOnce();
    expect(result).toMatchObject({ eventsScanned: 1, actionsProposed: 0 });
    expect(await actions.list(tenantId)).toHaveLength(0);
  });

  it("idempotent : rescanner ne propose pas deux fois pour le même avis", async () => {
    await submitReviewEvent("rev-3", 1);

    await observer.runOnce();
    const second = await observer.runOnce();

    expect(second.actionsProposed).toBe(0);
    expect(await actions.list(tenantId)).toHaveLength(1);
  });

  it("ignore les événements hors fenêtre", async () => {
    await ctx.db.insert(schema.events).values({
      tenantId,
      type: "review.submitted",
      payload: { reviewId: "rev-old", rating: 1 },
      createdAt: new Date(Date.now() - 5 * 3600_000),
    });

    const result = await observer.runOnce();
    expect(result).toMatchObject({ eventsScanned: 0, actionsProposed: 0 });
  });
});
