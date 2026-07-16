import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SecretBox } from "../lib/secret-box.js";
import { ShopifyConnectionService, normalizeShopDomain } from "./shopify-connection.js";

const ENC_KEY = "0".repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("normalizeShopDomain", () => {
  it("accepte URL complète, domaine nu, majuscules et slash final", () => {
    expect(normalizeShopDomain("https://Ma-Boutique.myshopify.com/admin")).toBe(
      "ma-boutique.myshopify.com",
    );
    expect(normalizeShopDomain("ma-boutique.myshopify.com")).toBe("ma-boutique.myshopify.com");
  });

  it("rejette tout ce qui n'est pas *.myshopify.com", () => {
    expect(() => normalizeShopDomain("boutique.fr")).toThrow(/myshopify/i);
    expect(() => normalizeShopDomain("evil.com/x.myshopify.com")).toThrow(/myshopify/i);
  });
});

describe("ShopifyConnectionService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let box: SecretBox;

  beforeEach(async () => {
    ctx = await createTestDb();
    box = new SecretBox(ENC_KEY);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-shopify", name: "Resto" })
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
      .from(schema.tenantShopifyConnections)
      .where(eq(schema.tenantShopifyConnections.tenantId, tenantId));
  }

  it("connect : valide domaine + jeton, chiffre (jamais exposé), bootstrap le curseur", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ shop: { name: "Ma Boutique" } }));
    const svc = new ShopifyConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    const now = new Date("2026-07-16T10:00:00Z");

    const safe = await svc.connect(
      tenantId,
      "ma-boutique.myshopify.com",
      "shpat_abcdef123456",
      now,
    );

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ma-boutique.myshopify.com/admin/api/2024-10/shop.json");
    expect((init.headers as Record<string, string>)["X-Shopify-Access-Token"]).toBe(
      "shpat_abcdef123456",
    );

    expect(safe).not.toHaveProperty("accessTokenEnc");
    expect(safe.shopLabel).toBe("Ma Boutique");
    expect(safe.orderCursor?.toISOString()).toBe(now.toISOString());

    const [row] = await rows();
    expect(row?.accessTokenEnc).not.toContain("shpat_abcdef123456");
    expect(box.decrypt(row!.accessTokenEnc)).toBe("shpat_abcdef123456");
  });

  it("connect : jeton trop court ou domaine invalide → rejet sans appel réseau", async () => {
    const fetchImpl = vi.fn();
    const svc = new ShopifyConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    await expect(svc.connect(tenantId, "ma-boutique.myshopify.com", "court")).rejects.toThrow(
      /invalide/i,
    );
    await expect(svc.connect(tenantId, "boutique.fr", "shpat_abcdef123456")).rejects.toThrow(
      /myshopify/i,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("connect : Shopify renvoie 401 → jeton refusé, rien en base", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, 401));
    const svc = new ShopifyConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    await expect(
      svc.connect(tenantId, "ma-boutique.myshopify.com", "shpat_wrong12345"),
    ).rejects.toThrow(/refus/i);
    expect(await rows()).toHaveLength(0);
  });

  it("listOrdersSince : centimes, tri croissant, dates invalides ignorées", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        orders: [
          {
            id: 2,
            name: "#1002",
            total_price: "42.50",
            total_tax: "7.08",
            currency: "eur",
            financial_status: "paid",
            created_at: "2026-07-15T12:00:00Z",
          },
          {
            id: 1,
            name: "#1001",
            total_price: "120.00",
            total_tax: "20.00",
            currency: "eur",
            financial_status: "paid",
            created_at: "2026-07-14T09:00:00Z",
          },
          { id: 3, total_price: "10.00", created_at: "pas-une-date" },
        ],
      }),
    );
    const svc = new ShopifyConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);

    const orders = await svc.listOrdersSince(
      "ma-boutique.myshopify.com",
      "tok",
      new Date("2026-07-14T00:00:00Z"),
    );
    expect(orders.map((o) => o.id)).toEqual(["1", "2"]);
    expect(orders[0]).toMatchObject({ totalCents: 12000, taxCents: 2000, currency: "EUR" });
    expect(orders[1]).toMatchObject({ totalCents: 4250, taxCents: 708, name: "#1002" });
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain("created_at_min=2026-07-14T00%3A00%3A00.000Z");
  });

  it("list/setStatus/remove : cycle sans exposer le jeton", async () => {
    const svc = new ShopifyConnectionService(ctx.db, box);
    const [row] = await ctx.db
      .insert(schema.tenantShopifyConnections)
      .values({
        tenantId,
        shopDomain: "ma-boutique.myshopify.com",
        accessTokenEnc: box.encrypt("tok-secret"),
      })
      .returning();
    if (!row) throw new Error("insert failed");

    const listed = await svc.list(tenantId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("accessTokenEnc");

    const paused = await svc.setStatus(tenantId, row.id, "paused");
    expect(paused.status).toBe("paused");

    await svc.remove(tenantId, row.id);
    expect(await rows()).toHaveLength(0);
  });
});
