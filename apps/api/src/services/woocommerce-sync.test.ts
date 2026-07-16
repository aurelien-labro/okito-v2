import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SecretBox } from "../lib/secret-box.js";
import { EventBusService } from "./event-bus.js";
import type { WoocommerceConnectionService, WoocommerceOrder } from "./woocommerce-connection.js";
import { WoocommerceSyncService } from "./woocommerce-sync.js";

const ENC_KEY = "0".repeat(64);

function order(id: string, createdAt: string, totalCents: number): WoocommerceOrder {
  return {
    id,
    number: id,
    totalCents,
    taxCents: Math.round(totalCents / 6),
    currency: "EUR",
    status: "completed",
    createdAt: new Date(createdAt),
  };
}

describe("WoocommerceSyncService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let box: SecretBox;

  beforeEach(async () => {
    ctx = await createTestDb();
    box = new SecretBox(ENC_KEY);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-woo-sync", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function seedConnection(cursor: Date | null, status = "active") {
    const [row] = await ctx.db
      .insert(schema.tenantWoocommerceConnections)
      .values({
        tenantId,
        storeUrl: "https://boutique.fr",
        credentialsEnc: box.encrypt(JSON.stringify({ consumerKey: "ck", consumerSecret: "cs" })),
        orderCursor: cursor,
        status: status as "active",
      })
      .returning();
    if (!row) throw new Error("connection insert failed");
    return row;
  }

  async function events() {
    return ctx.db.select().from(schema.events).where(eq(schema.events.tenantId, tenantId));
  }

  function fakeConnections(orders: WoocommerceOrder[]): WoocommerceConnectionService {
    return {
      decryptCredentials: () => ({ consumerKey: "ck", consumerSecret: "cs" }),
      listOrdersSince: vi.fn().mockResolvedValue(orders),
    } as unknown as WoocommerceConnectionService;
  }

  it("publie woocommerce.order et avance le curseur, ignore la commande pile sur le curseur", async () => {
    const conn = await seedConnection(new Date("2026-07-14T09:00:00Z"));
    const connections = fakeConnections([
      order("1001", "2026-07-14T09:00:00Z", 12000),
      order("1002", "2026-07-15T12:00:00Z", 4250),
    ]);
    const sync = new WoocommerceSyncService(ctx.db, connections, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ connectionsProcessed: 1, ordersIngested: 1, errors: 0 });
    await new Promise((r) => setTimeout(r, 30));
    const evs = await events();
    expect(evs).toHaveLength(1);
    expect(evs[0]?.payload).toMatchObject({
      orderId: "1002",
      orderNumber: "1002",
      totalCents: 4250,
      currency: "EUR",
      status: "completed",
    });

    const [row] = await ctx.db
      .select()
      .from(schema.tenantWoocommerceConnections)
      .where(eq(schema.tenantWoocommerceConnections.id, conn.id));
    expect(row?.orderCursor?.toISOString()).toBe("2026-07-15T12:00:00.000Z");
    expect(row?.lastError).toBeNull();
  });

  it("une boutique en erreur n'empêche pas le run et marque la connexion", async () => {
    await seedConnection(new Date("2026-07-01T00:00:00Z"));
    const connections = {
      decryptCredentials: () => ({ consumerKey: "ck", consumerSecret: "cs" }),
      listOrdersSince: vi.fn().mockRejectedValue(new Error("orders.list HTTP 500")),
    } as unknown as WoocommerceConnectionService;
    const sync = new WoocommerceSyncService(ctx.db, connections, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ connectionsProcessed: 1, errors: 1 });
    const [row] = await ctx.db.select().from(schema.tenantWoocommerceConnections);
    expect(row?.status).toBe("error");
    expect(row?.lastError).toContain("HTTP 500");
  });

  it("ignore les boutiques non-actives", async () => {
    await seedConnection(new Date("2026-07-01T00:00:00Z"), "paused");
    const sync = new WoocommerceSyncService(
      ctx.db,
      fakeConnections([order("1001", "2026-07-03T00:00:00Z", 100)]),
      new EventBusService(ctx.db),
    );

    const result = await sync.runOnce();
    expect(result.connectionsProcessed).toBe(0);
    expect(await events()).toHaveLength(0);
  });
});
