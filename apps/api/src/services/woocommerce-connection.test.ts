import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SecretBox } from "../lib/secret-box.js";
import { WoocommerceConnectionService, normalizeStoreUrl } from "./woocommerce-connection.js";

const ENC_KEY = "0".repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("normalizeStoreUrl", () => {
  it("retire le chemin et le slash final, garde le host", () => {
    expect(normalizeStoreUrl("https://boutique.fr/wp-admin/")).toBe("https://boutique.fr");
    expect(normalizeStoreUrl("https://boutique.fr")).toBe("https://boutique.fr");
  });

  it("rejette HTTP et les entrées invalides", () => {
    expect(() => normalizeStoreUrl("http://boutique.fr")).toThrow(/https/i);
    expect(() => normalizeStoreUrl("boutique.fr")).toThrow(/format/i);
  });
});

describe("WoocommerceConnectionService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let box: SecretBox;

  beforeEach(async () => {
    ctx = await createTestDb();
    box = new SecretBox(ENC_KEY);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-woo", name: "Resto" })
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
      .from(schema.tenantWoocommerceConnections)
      .where(eq(schema.tenantWoocommerceConnections.tenantId, tenantId));
  }

  it("connect : valide les clés en Basic Auth, chiffre (jamais exposées), bootstrap le curseur", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse([]));
    const svc = new WoocommerceConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    const now = new Date("2026-07-16T10:00:00Z");

    const safe = await svc.connect(
      tenantId,
      "https://boutique.fr/",
      "ck_abcdef123456",
      "cs_abcdef123456",
      now,
    );

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://boutique.fr/wp-json/wc/v3/orders?per_page=1");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("ck_abcdef123456:cs_abcdef123456").toString("base64")}`,
    );

    expect(safe).not.toHaveProperty("credentialsEnc");
    expect(safe.storeLabel).toBe("boutique.fr");
    expect(safe.orderCursor?.toISOString()).toBe(now.toISOString());

    const [row] = await rows();
    expect(row?.credentialsEnc).not.toContain("ck_abcdef123456");
    if (!row) throw new Error("row missing");
    expect(JSON.parse(box.decrypt(row.credentialsEnc))).toEqual({
      consumerKey: "ck_abcdef123456",
      consumerSecret: "cs_abcdef123456",
    });
  });

  it("connect : clés trop courtes ou URL invalide → rejet sans appel réseau", async () => {
    const fetchImpl = vi.fn();
    const svc = new WoocommerceConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    await expect(
      svc.connect(tenantId, "https://boutique.fr", "court", "cs_ok1234567"),
    ).rejects.toThrow(/invalide/i);
    await expect(
      svc.connect(tenantId, "http://boutique.fr", "ck_abcdef123456", "cs_abcdef123456"),
    ).rejects.toThrow(/https/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("connect : WooCommerce renvoie 401 → clés refusées, rien en base", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, 401));
    const svc = new WoocommerceConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    await expect(
      svc.connect(tenantId, "https://boutique.fr", "ck_wrong123456", "cs_wrong123456"),
    ).rejects.toThrow(/refus/i);
    expect(await rows()).toHaveLength(0);
  });

  it("listOrdersSince : centimes, tri croissant, dates invalides ignorées, GMT forcé UTC", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse([
        {
          id: 2,
          number: "1002",
          total: "42.50",
          total_tax: "7.08",
          currency: "eur",
          status: "processing",
          date_created_gmt: "2026-07-15T12:00:00",
        },
        {
          id: 1,
          number: "1001",
          total: "120.00",
          total_tax: "20.00",
          currency: "eur",
          status: "completed",
          date_created_gmt: "2026-07-14T09:00:00",
        },
        { id: 3, total: "10.00", date_created_gmt: "pas-une-date" },
      ]),
    );
    const svc = new WoocommerceConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);

    const orders = await svc.listOrdersSince(
      "https://boutique.fr",
      { consumerKey: "ck", consumerSecret: "cs" },
      new Date("2026-07-14T00:00:00Z"),
    );
    expect(orders.map((o) => o.id)).toEqual(["1", "2"]);
    expect(orders[0]).toMatchObject({ totalCents: 12000, taxCents: 2000, currency: "EUR" });
    expect(orders[0]?.createdAt.toISOString()).toBe("2026-07-14T09:00:00.000Z");
    expect(orders[1]).toMatchObject({ totalCents: 4250, taxCents: 708, number: "1002" });
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain("after=2026-07-14T00%3A00%3A00.000Z");
    expect(url).toContain("order=asc");
  });

  it("list/setStatus/remove : cycle sans exposer les clés", async () => {
    const svc = new WoocommerceConnectionService(ctx.db, box);
    const [row] = await ctx.db
      .insert(schema.tenantWoocommerceConnections)
      .values({
        tenantId,
        storeUrl: "https://boutique.fr",
        credentialsEnc: box.encrypt(JSON.stringify({ consumerKey: "ck", consumerSecret: "cs" })),
      })
      .returning();
    if (!row) throw new Error("insert failed");

    const listed = await svc.list(tenantId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("credentialsEnc");

    const paused = await svc.setStatus(tenantId, row.id, "paused");
    expect(paused.status).toBe("paused");

    await svc.remove(tenantId, row.id);
    expect(await rows()).toHaveLength(0);
  });
});
