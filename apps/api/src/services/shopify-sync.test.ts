import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SecretBox } from "../lib/secret-box.js";
import { EventBusService } from "./event-bus.js";
import type { ShopifyConnectionService, ShopifyOrder } from "./shopify-connection.js";
import { ShopifySyncService } from "./shopify-sync.js";

const ENC_KEY = "0".repeat(64);

function order(id: string, createdAt: string, totalCents: number): ShopifyOrder {
  return {
    id,
    name: `#${id}`,
    totalCents,
    taxCents: Math.round(totalCents / 6),
    currency: "EUR",
    financialStatus: "paid",
    createdAt: new Date(createdAt),
  };
}

describe("ShopifySyncService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let box: SecretBox;

  beforeEach(async () => {
    ctx = await createTestDb();
    box = new SecretBox(ENC_KEY);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-shopify-sync", name: "Resto" })
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
      .insert(schema.tenantShopifyConnections)
      .values({
        tenantId,
        shopDomain: "ma-boutique.myshopify.com",
        accessTokenEnc: box.encrypt("tok"),
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

  function fakeConnections(orders: ShopifyOrder[]): ShopifyConnectionService {
    return {
      decryptToken: (c: { accessTokenEnc: string }) => box.decrypt(c.accessTokenEnc),
      listOrdersSince: vi.fn().mockResolvedValue(orders),
    } as unknown as ShopifyConnectionService;
  }

  it("publie shopify.order et avance le curseur, ignore la commande pile sur le curseur", async () => {
    const conn = await seedConnection(new Date("2026-07-14T09:00:00Z"));
    const connections = fakeConnections([
      // Pile sur le curseur : déjà ingérée au run précédent (filtre inclusif).
      order("1001", "2026-07-14T09:00:00Z", 12000),
      order("1002", "2026-07-15T12:00:00Z", 4250),
    ]);
    const sync = new ShopifySyncService(ctx.db, connections, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ connectionsProcessed: 1, ordersIngested: 1, errors: 0 });
    await new Promise((r) => setTimeout(r, 30));
    const evs = await events();
    expect(evs).toHaveLength(1);
    expect(evs[0]?.payload).toMatchObject({
      orderId: "1002",
      orderName: "#1002",
      totalCents: 4250,
      currency: "EUR",
      financialStatus: "paid",
    });

    const [row] = await ctx.db
      .select()
      .from(schema.tenantShopifyConnections)
      .where(eq(schema.tenantShopifyConnections.id, conn.id));
    expect(row?.orderCursor?.toISOString()).toBe("2026-07-15T12:00:00.000Z");
    expect(row?.lastError).toBeNull();
  });

  it("une boutique en erreur n'empêche pas le run et marque la connexion", async () => {
    await seedConnection(new Date("2026-07-01T00:00:00Z"));
    const connections = {
      decryptToken: () => "tok",
      listOrdersSince: vi.fn().mockRejectedValue(new Error("orders.list HTTP 500")),
    } as unknown as ShopifyConnectionService;
    const sync = new ShopifySyncService(ctx.db, connections, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ connectionsProcessed: 1, errors: 1 });
    const [row] = await ctx.db.select().from(schema.tenantShopifyConnections);
    expect(row?.status).toBe("error");
    expect(row?.lastError).toContain("HTTP 500");
  });

  it("ignore les boutiques non-actives", async () => {
    await seedConnection(new Date("2026-07-01T00:00:00Z"), "paused");
    const sync = new ShopifySyncService(
      ctx.db,
      fakeConnections([order("1001", "2026-07-03T00:00:00Z", 100)]),
      new EventBusService(ctx.db),
    );

    const result = await sync.runOnce();
    expect(result.connectionsProcessed).toBe(0);
    expect(await events()).toHaveLength(0);
  });
});
