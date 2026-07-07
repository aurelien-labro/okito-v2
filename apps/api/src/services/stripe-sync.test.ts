import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SecretBox } from "../lib/secret-box.js";
import { EventBusService } from "./event-bus.js";
import type { StripeAccountService, StripeCharge } from "./stripe-account.js";
import { StripeSyncService } from "./stripe-sync.js";

const ENC_KEY = "0".repeat(64);

function charge(id: string, created: string, amountCents = 1000): StripeCharge {
  return { id, amountCents, currency: "EUR", description: null, created: new Date(created) };
}

describe("StripeSyncService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let box: SecretBox;

  beforeEach(async () => {
    ctx = await createTestDb();
    box = new SecretBox(ENC_KEY);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-stripe-sync", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function seedAccount(chargeCursor: Date | null, status = "active") {
    const [row] = await ctx.db
      .insert(schema.tenantStripeAccounts)
      .values({
        tenantId,
        secretKeyEnc: box.encrypt("sk_test_x"),
        chargeCursor,
        status: status as "active",
      })
      .returning();
    if (!row) throw new Error("account insert failed");
    return row;
  }

  async function events() {
    return ctx.db.select().from(schema.events).where(eq(schema.events.tenantId, tenantId));
  }

  function fakeAccounts(charges: StripeCharge[]): StripeAccountService {
    return {
      decryptKey: (a: { secretKeyEnc: string }) => box.decrypt(a.secretKeyEnc),
      listChargesSince: vi.fn().mockResolvedValue(charges),
    } as unknown as StripeAccountService;
  }

  it("publie payment.received par paiement et avance le curseur", async () => {
    const account = await seedAccount(new Date("2026-07-06T00:00:00Z"));
    const accounts = fakeAccounts([
      charge("ch_1", "2026-07-06T09:00:00Z", 1500),
      charge("ch_2", "2026-07-06T11:00:00Z", 4200),
    ]);
    const sync = new StripeSyncService(ctx.db, accounts, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ accountsProcessed: 1, paymentsIngested: 2, errors: 0 });
    await new Promise((r) => setTimeout(r, 30));
    const evs = await events();
    expect(evs).toHaveLength(2);
    expect(evs.every((e) => e.type === "payment.received")).toBe(true);
    expect(evs.map((e) => (e.payload as { chargeId: string }).chargeId).sort()).toEqual([
      "ch_1",
      "ch_2",
    ]);

    const [row] = await ctx.db
      .select()
      .from(schema.tenantStripeAccounts)
      .where(eq(schema.tenantStripeAccounts.id, account.id));
    // curseur avancé au paiement le plus récent
    expect(row?.chargeCursor?.toISOString()).toBe("2026-07-06T11:00:00.000Z");
  });

  it("aucun paiement : curseur inchangé, aucun event", async () => {
    const account = await seedAccount(new Date("2026-07-06T00:00:00Z"));
    const sync = new StripeSyncService(ctx.db, fakeAccounts([]), new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ paymentsIngested: 0, errors: 0 });
    expect(await events()).toHaveLength(0);
    const [row] = await ctx.db
      .select()
      .from(schema.tenantStripeAccounts)
      .where(eq(schema.tenantStripeAccounts.id, account.id));
    expect(row?.chargeCursor?.toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  it("un compte en erreur n'empêche pas les autres", async () => {
    await seedAccount(new Date("2026-07-06T00:00:00Z"));
    const accounts = {
      decryptKey: () => "sk_test_x",
      listChargesSince: vi.fn().mockRejectedValue(new Error("charges.list HTTP 500")),
    } as unknown as StripeAccountService;
    const sync = new StripeSyncService(ctx.db, accounts, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ accountsProcessed: 1, errors: 1 });
    const [row] = await ctx.db.select().from(schema.tenantStripeAccounts);
    expect(row?.status).toBe("error");
    expect(row?.lastError).toContain("HTTP 500");
  });

  it("ignore les comptes non-actifs", async () => {
    await seedAccount(new Date("2026-07-06T00:00:00Z"), "paused");
    const accounts = fakeAccounts([charge("ch_1", "2026-07-06T09:00:00Z")]);
    const sync = new StripeSyncService(ctx.db, accounts, new EventBusService(ctx.db));

    const result = await sync.runOnce();
    expect(result.accountsProcessed).toBe(0);
    expect(await events()).toHaveLength(0);
  });
});
