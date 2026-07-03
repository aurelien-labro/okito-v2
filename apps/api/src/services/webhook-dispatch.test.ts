import { createHmac } from "node:crypto";
import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { WebhookDispatchService } from "./webhook-dispatch.js";

describe("WebhookDispatchService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-wh", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function addHook(url: string, secret: string, events: string[] = []) {
    await ctx.db
      .insert(schema.tenantWebhooks)
      .values({ tenantId, url, secret, events: events as never });
  }

  function waitFor(fn: () => boolean, ms = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (fn()) {
          clearInterval(iv);
          resolve();
        } else if (Date.now() - start > ms) {
          clearInterval(iv);
          reject(new Error("timeout"));
        }
      }, 5);
    });
  }

  it("POST signé HMAC vers les endpoints abonnés", async () => {
    await addHook("https://hook.test/a", "sekret1234567890");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const svc = new WebhookDispatchService(ctx.db, fetchMock as unknown as typeof fetch);

    svc.emit(tenantId, "reservation.created", { id: "r1" });
    await waitFor(() => fetchMock.mock.calls.length === 1);

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch non appelé");
    const [url, init] = call as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://hook.test/a");
    const body = init.body as string;
    const expectedSig = createHmac("sha256", "sekret1234567890").update(body).digest("hex");
    expect(init.headers["X-Okito-Signature"]).toBe(`sha256=${expectedSig}`);
    expect(init.headers["X-Okito-Event"]).toBe("reservation.created");
    expect(JSON.parse(body)).toMatchObject({ event: "reservation.created", data: { id: "r1" } });
  });

  it("filtre par event : un hook non abonné n'est pas appelé", async () => {
    await addHook("https://hook.test/only-cancel", "s1234567890abcd", ["reservation.cancelled"]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const svc = new WebhookDispatchService(ctx.db, fetchMock as unknown as typeof fetch);

    svc.emit(tenantId, "reservation.created", { id: "r1" });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retry sur échec 500 puis succès", async () => {
    await addHook("https://hook.test/flaky", "s1234567890abcd");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const svc = new WebhookDispatchService(ctx.db, fetchMock as unknown as typeof fetch);

    svc.emit(tenantId, "reservation.created", { id: "r1" });
    await waitFor(() => fetchMock.mock.calls.length === 2, 2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("4xx (hors 429) : pas de retry", async () => {
    await addHook("https://hook.test/bad", "s1234567890abcd");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    const svc = new WebhookDispatchService(ctx.db, fetchMock as unknown as typeof fetch);

    svc.emit(tenantId, "reservation.created", { id: "r1" });
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
