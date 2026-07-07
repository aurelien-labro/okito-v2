import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SecretBox } from "../lib/secret-box.js";
import type { BankConnectionService, BankTransaction } from "./bank-connection.js";
import { BankSyncService } from "./bank-sync.js";
import { EventBusService } from "./event-bus.js";

const ENC_KEY = "0".repeat(64);

function txn(id: string, date: string, amountCents: number): BankTransaction {
  return { id, amountCents, currency: "EUR", description: null, date: new Date(date) };
}

describe("BankSyncService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let box: SecretBox;

  beforeEach(async () => {
    ctx = await createTestDb();
    box = new SecretBox(ENC_KEY);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-bank-sync", name: "Resto" })
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
      .insert(schema.tenantBankConnections)
      .values({
        tenantId,
        accessTokenEnc: box.encrypt("tok"),
        transactionCursor: cursor,
        status: status as "active",
      })
      .returning();
    if (!row) throw new Error("connection insert failed");
    return row;
  }

  async function events() {
    return ctx.db.select().from(schema.events).where(eq(schema.events.tenantId, tenantId));
  }

  function fakeConnections(txns: BankTransaction[]): BankConnectionService {
    return {
      decryptToken: (c: { accessTokenEnc: string }) => box.decrypt(c.accessTokenEnc),
      listTransactionsSince: vi.fn().mockResolvedValue(txns),
    } as unknown as BankConnectionService;
  }

  it("publie bank.transaction (débit/crédit) et avance le curseur", async () => {
    const conn = await seedConnection(new Date("2026-07-01T00:00:00Z"));
    const connections = fakeConnections([
      txn("t1", "2026-07-03T00:00:00Z", 12000),
      txn("t2", "2026-07-05T00:00:00Z", -4250),
    ]);
    const sync = new BankSyncService(ctx.db, connections, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ connectionsProcessed: 1, transactionsIngested: 2, errors: 0 });
    await new Promise((r) => setTimeout(r, 30));
    const evs = await events();
    expect(evs).toHaveLength(2);
    const byId = Object.fromEntries(
      evs.map((e) => [(e.payload as { transactionId: string }).transactionId, e.payload]),
    );
    expect(byId.t1).toMatchObject({ direction: "credit", amountCents: 12000 });
    expect(byId.t2).toMatchObject({ direction: "debit", amountCents: -4250 });

    const [row] = await ctx.db
      .select()
      .from(schema.tenantBankConnections)
      .where(eq(schema.tenantBankConnections.id, conn.id));
    expect(row?.transactionCursor?.toISOString()).toBe("2026-07-05T00:00:00.000Z");
  });

  it("une connexion en erreur n'empêche pas les autres", async () => {
    await seedConnection(new Date("2026-07-01T00:00:00Z"));
    const connections = {
      decryptToken: () => "tok",
      listTransactionsSince: vi.fn().mockRejectedValue(new Error("transactions.list HTTP 500")),
    } as unknown as BankConnectionService;
    const sync = new BankSyncService(ctx.db, connections, new EventBusService(ctx.db));

    const result = await sync.runOnce();

    expect(result).toMatchObject({ connectionsProcessed: 1, errors: 1 });
    const [row] = await ctx.db.select().from(schema.tenantBankConnections);
    expect(row?.status).toBe("error");
    expect(row?.lastError).toContain("HTTP 500");
  });

  it("ignore les connexions non-actives", async () => {
    await seedConnection(new Date("2026-07-01T00:00:00Z"), "paused");
    const sync = new BankSyncService(
      ctx.db,
      fakeConnections([txn("t1", "2026-07-03T00:00:00Z", 100)]),
      new EventBusService(ctx.db),
    );

    const result = await sync.runOnce();
    expect(result.connectionsProcessed).toBe(0);
    expect(await events()).toHaveLength(0);
  });
});
