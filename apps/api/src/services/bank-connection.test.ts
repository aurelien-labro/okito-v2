import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SecretBox } from "../lib/secret-box.js";
import { BankConnectionService } from "./bank-connection.js";

const ENC_KEY = "0".repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("BankConnectionService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let box: SecretBox;

  beforeEach(async () => {
    ctx = await createTestDb();
    box = new SecretBox(ENC_KEY);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-bank", name: "Resto" })
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
      .from(schema.tenantBankConnections)
      .where(eq(schema.tenantBankConnections.tenantId, tenantId));
  }

  it("connect : valide le jeton, le chiffre (jamais exposé), bootstrap le curseur", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ resources: [] }));
    const svc = new BankConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    const now = new Date("2026-07-06T10:00:00Z");

    const safe = await svc.connect(tenantId, "bridge-token-abcdef", now);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/accounts");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer bridge-token-abcdef",
    );

    expect(safe).not.toHaveProperty("accessTokenEnc");
    expect(safe.transactionCursor?.toISOString()).toBe(now.toISOString());

    const [row] = await rows();
    expect(row?.accessTokenEnc).not.toContain("bridge-token-abcdef");
    expect(box.decrypt(row!.accessTokenEnc)).toBe("bridge-token-abcdef");
  });

  it("connect : jeton trop court → rejet sans appel réseau", async () => {
    const fetchImpl = vi.fn();
    const svc = new BankConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    await expect(svc.connect(tenantId, "court")).rejects.toThrow(/invalide/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("connect : agrégateur renvoie 401 → jeton refusé", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, 401));
    const svc = new BankConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);
    await expect(svc.connect(tenantId, "bridge-token-xxxxxx")).rejects.toThrow(/refus/i);
    expect(await rows()).toHaveLength(0);
  });

  it("listTransactionsSince : convertit en centimes signés, trie croissant, ignore dates invalides", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        resources: [
          {
            id: 2,
            amount: -42.5,
            currency_code: "eur",
            description: "Fournisseur",
            date: "2026-07-05",
          },
          { id: 1, amount: 120.0, currency_code: "eur", description: "Client", date: "2026-07-03" },
          { id: 3, amount: 10, date: "pas-une-date" },
        ],
      }),
    );
    const svc = new BankConnectionService(ctx.db, box, fetchImpl as unknown as typeof fetch);

    const txns = await svc.listTransactionsSince("tok", new Date("2026-07-01T00:00:00Z"));
    expect(txns.map((t) => t.id)).toEqual(["1", "2"]);
    expect(txns[0]).toMatchObject({ amountCents: 12000, currency: "EUR", description: "Client" });
    expect(txns[1]).toMatchObject({ amountCents: -4250, description: "Fournisseur" });
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain("since=2026-07-01");
  });

  it("list/setStatus/remove : cycle sans exposer le jeton", async () => {
    const svc = new BankConnectionService(ctx.db, box);
    const [row] = await ctx.db
      .insert(schema.tenantBankConnections)
      .values({ tenantId, accessTokenEnc: box.encrypt("tok-secret") })
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
