import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { EventBusService } from "./event-bus.js";
import { GmailSyncService } from "./gmail-sync.js";
import type { MailboxService } from "./mailbox.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fakeMailboxes = {
  getFreshAccessToken: vi.fn().mockResolvedValue("token-1"),
} as unknown as MailboxService;

describe("GmailSyncService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-sync", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function seedMailbox(historyId: string | null, status = "active") {
    const [box] = await ctx.db
      .insert(schema.tenantMailboxes)
      .values({
        tenantId,
        emailAddress: "contact@resto.fr",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        historyId,
        status: status as "active",
      })
      .returning();
    if (!box) throw new Error("mailbox insert failed");
    return box;
  }

  async function events() {
    return ctx.db.select().from(schema.events).where(eq(schema.events.tenantId, tenantId));
  }

  it("première sync : bootstrap du curseur, aucun email ingéré", async () => {
    const box = await seedMailbox(null);
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ historyId: "1000" }));
    const svc = new GmailSyncService(
      ctx.db,
      fakeMailboxes,
      new EventBusService(ctx.db),
      fetchMock as unknown as typeof fetch,
    );

    const result = await svc.runOnce();

    expect(result).toMatchObject({ mailboxesProcessed: 1, emailsIngested: 0, errors: 0 });
    const updated = await ctx.db.query.tenantMailboxes.findFirst({
      where: (m, { eq: e }) => e(m.id, box.id),
    });
    expect(updated?.historyId).toBe("1000");
    expect(await events()).toHaveLength(0);
  });

  it("sync incrémentale : nouveaux messages → events email.received + curseur avancé", async () => {
    const box = await seedMailbox("1000");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          historyId: "1050",
          history: [
            { messagesAdded: [{ message: { id: "m1" } }] },
            { messagesAdded: [{ message: { id: "m2" } }, { message: { id: "m1" } }] },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "m1",
          threadId: "t1",
          snippet: "Bonjour, avez-vous une table…",
          internalDate: "1783000000000",
          payload: {
            headers: [
              { name: "From", value: "Marie <marie@test.fr>" },
              { name: "Subject", value: "Réservation samedi" },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: "m2", snippet: "Facture jointe", payload: { headers: [] } }),
      );
    const svc = new GmailSyncService(
      ctx.db,
      fakeMailboxes,
      new EventBusService(ctx.db),
      fetchMock as unknown as typeof fetch,
    );

    const result = await svc.runOnce();

    expect(result).toMatchObject({ emailsIngested: 2, errors: 0 });
    const rows = await events();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.type)).toEqual(["email.received", "email.received"]);
    const m1 = rows.find((r) => (r.payload as { messageId: string }).messageId === "m1");
    expect(m1?.payload).toMatchObject({
      from: "Marie <marie@test.fr>",
      subject: "Réservation samedi",
      mailboxId: box.id,
    });
    expect(m1?.source).toBe("gmail");

    const updated = await ctx.db.query.tenantMailboxes.findFirst({
      where: (m, { eq: e }) => e(m.id, box.id),
    });
    expect(updated?.historyId).toBe("1050");
    expect(updated?.lastSyncAt).toBeInstanceOf(Date);
  });

  it("historyId expiré (404) : re-bootstrap sans erreur", async () => {
    const box = await seedMailbox("999");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ historyId: "2000" }));
    const svc = new GmailSyncService(
      ctx.db,
      fakeMailboxes,
      new EventBusService(ctx.db),
      fetchMock as unknown as typeof fetch,
    );

    const result = await svc.runOnce();

    expect(result).toMatchObject({ emailsIngested: 0, errors: 0 });
    const updated = await ctx.db.query.tenantMailboxes.findFirst({
      where: (m, { eq: e }) => e(m.id, box.id),
    });
    expect(updated?.historyId).toBe("2000");
    expect(updated?.status).toBe("active");
  });

  it("erreur API : boîte marquée error, les autres continuent", async () => {
    await seedMailbox("1000");
    const [tenant2] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-2-sync", name: "R2" })
      .returning();
    if (!tenant2) throw new Error("tenant insert failed");
    const [box2] = await ctx.db
      .insert(schema.tenantMailboxes)
      .values({
        tenantId: tenant2.id,
        emailAddress: "b@b.fr",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        historyId: "500",
      })
      .returning();
    if (!box2) throw new Error("mailbox insert failed");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ historyId: "600", history: [] }));
    const svc = new GmailSyncService(
      ctx.db,
      fakeMailboxes,
      new EventBusService(ctx.db),
      fetchMock as unknown as typeof fetch,
    );

    const result = await svc.runOnce();

    expect(result).toMatchObject({ mailboxesProcessed: 2, errors: 1 });
    const boxes = await ctx.db.select().from(schema.tenantMailboxes);
    const failed = boxes.find((b) => b.tenantId === tenantId);
    const okBox = boxes.find((b) => b.tenantId === tenant2.id);
    expect(failed?.status).toBe("error");
    expect(failed?.lastError).toContain("history.list HTTP 500");
    expect(okBox?.status).toBe("active");
  });

  it("boîte paused : ignorée", async () => {
    await seedMailbox("1000", "paused");
    const fetchMock = vi.fn();
    const svc = new GmailSyncService(
      ctx.db,
      fakeMailboxes,
      new EventBusService(ctx.db),
      fetchMock as unknown as typeof fetch,
    );

    const result = await svc.runOnce();
    expect(result).toMatchObject({ mailboxesProcessed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
