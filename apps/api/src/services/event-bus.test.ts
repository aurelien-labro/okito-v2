import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { EventBusService } from "./event-bus.js";
import type { WebhookDispatchService } from "./webhook-dispatch.js";

describe("EventBusService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-bus", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function waitFor(fn: () => Promise<boolean>, ms = 1000): Promise<void> {
    const start = Date.now();
    while (!(await fn())) {
      if (Date.now() - start > ms) throw new Error("timeout");
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  async function storedEvents() {
    return ctx.db.select().from(schema.events).where(eq(schema.events.tenantId, tenantId));
  }

  it("emit journalise l'événement dans la table events", async () => {
    const bus = new EventBusService(ctx.db);
    bus.emit(tenantId, "reservation.created", { id: "r1", couverts: 4 });

    await waitFor(async () => (await storedEvents()).length === 1);
    const [row] = await storedEvents();
    expect(row).toMatchObject({
      tenantId,
      type: "reservation.created",
      source: "api",
      payload: { id: "r1", couverts: 4 },
    });
  });

  it("emit relaie aux webhooks sortants", async () => {
    const dispatch = { emit: vi.fn() };
    const bus = new EventBusService(ctx.db, dispatch as unknown as WebhookDispatchService);

    bus.emit(tenantId, "reservation.cancelled", { id: "r2" });

    expect(dispatch.emit).toHaveBeenCalledWith(tenantId, "reservation.cancelled", { id: "r2" });
    await waitFor(async () => (await storedEvents()).length === 1);
  });

  it("publish journalise un type libre avec source, sans relais webhook", async () => {
    const dispatch = { emit: vi.fn() };
    const bus = new EventBusService(ctx.db, dispatch as unknown as WebhookDispatchService);

    bus.publish(tenantId, "jarvis.brief.generated", { items: 3 }, "jarvis");

    await waitFor(async () => (await storedEvents()).length === 1);
    const [row] = await storedEvents();
    expect(row).toMatchObject({ type: "jarvis.brief.generated", source: "jarvis" });
    expect(dispatch.emit).not.toHaveBeenCalled();
  });

  it("ne rejette jamais même si la persistance échoue", async () => {
    const brokenDb = {
      insert: () => ({
        values: () => Promise.reject(new Error("db down")),
      }),
    };
    const bus = new EventBusService(brokenDb as never);

    expect(() => bus.emit(tenantId, "reservation.created", { id: "r3" })).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
  });
});
