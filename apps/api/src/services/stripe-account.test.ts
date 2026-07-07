import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SecretBox } from "../lib/secret-box.js";
import { StripeAccountService } from "./stripe-account.js";

const ENC_KEY = "0".repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("StripeAccountService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let box: SecretBox;

  beforeEach(async () => {
    ctx = await createTestDb();
    box = new SecretBox(ENC_KEY);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-stripe", name: "Resto" })
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
      .from(schema.tenantStripeAccounts)
      .where(eq(schema.tenantStripeAccounts.tenantId, tenantId));
  }

  it("connect : valide la clé, la chiffre (jamais exposée), bootstrap le curseur", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [] }));
    const svc = new StripeAccountService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    const now = new Date("2026-07-06T10:00:00Z");

    const safe = await svc.connect(tenantId, "sk_test_ABC123", now);

    // La validation a bien tapé Stripe avec la clé en Bearer.
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/charges?limit=1");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_ABC123");

    expect(safe).not.toHaveProperty("secretKeyEnc");
    expect(safe.chargeCursor?.toISOString()).toBe(now.toISOString());

    const [row] = await rows();
    // Stockée chiffrée, déchiffrable, jamais en clair.
    expect(row?.secretKeyEnc).toBeTruthy();
    expect(row?.secretKeyEnc).not.toContain("sk_test_ABC123");
    expect(box.decrypt(row!.secretKeyEnc)).toBe("sk_test_ABC123");
  });

  it("connect : clé au mauvais format → rejet sans appel réseau", async () => {
    const fetchImpl = vi.fn();
    const svc = new StripeAccountService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    await expect(svc.connect(tenantId, "pas-une-cle")).rejects.toThrow(/invalide/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("connect : Stripe renvoie 401 → clé refusée", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ error: {} }, 401));
    const svc = new StripeAccountService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    await expect(svc.connect(tenantId, "sk_live_bad")).rejects.toThrow(/refus/i);
    expect(await rows()).toHaveLength(0);
  });

  it("listChargesSince : filtre payé/non-remboursé, convertit, trie croissant", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "ch_2",
            amount: 4200,
            currency: "eur",
            created: 1751800000,
            paid: true,
            description: "Commande #2",
          },
          {
            id: "ch_ref",
            amount: 999,
            currency: "eur",
            created: 1751700000,
            paid: true,
            refunded: true,
          },
          { id: "ch_unpaid", amount: 500, currency: "eur", created: 1751600000, paid: false },
          {
            id: "ch_1",
            amount: 1500,
            currency: "eur",
            created: 1751500000,
            paid: true,
            description: null,
          },
        ],
      }),
    );
    const svc = new StripeAccountService(ctx.db, box, fetchImpl as unknown as typeof fetch);

    const charges = await svc.listChargesSince("sk_test", new Date("2026-07-01T00:00:00Z"));
    expect(charges.map((c) => c.id)).toEqual(["ch_1", "ch_2"]);
    expect(charges[0]).toMatchObject({ amountCents: 1500, currency: "EUR", description: null });
    expect(charges[1]).toMatchObject({ amountCents: 4200, description: "Commande #2" });
    // created[gt] passé en secondes epoch (2026-07-01T00:00:00Z)
    const [url] = fetchImpl.mock.calls[0] as [string];
    const expectedUnix = Math.floor(Date.parse("2026-07-01T00:00:00Z") / 1000);
    expect(url).toContain(`created[gt]=${expectedUnix}`);
  });

  it("list/setStatus/remove : cycle sans exposer la clé", async () => {
    const svc = new StripeAccountService(ctx.db, box);
    const [row] = await ctx.db
      .insert(schema.tenantStripeAccounts)
      .values({ tenantId, secretKeyEnc: box.encrypt("sk_test_x") })
      .returning();
    if (!row) throw new Error("insert failed");

    const listed = await svc.list(tenantId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("secretKeyEnc");

    const paused = await svc.setStatus(tenantId, row.id, "paused");
    expect(paused.status).toBe("paused");

    await svc.remove(tenantId, row.id);
    expect(await rows()).toHaveLength(0);
  });
});
