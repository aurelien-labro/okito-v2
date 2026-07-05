import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { EventBusService } from "./event-bus.js";
import { GraphSyncService } from "./graph-sync.js";
import type { MicrosoftMailboxService } from "./microsoft-mailbox.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fakeMailboxes = {
  getFreshAccessToken: vi.fn().mockResolvedValue("graph-token"),
} as unknown as MicrosoftMailboxService;

describe("GraphSyncService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-graph", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function insertOutlookBox(config: Record<string, unknown> = {}) {
    const [row] = await ctx.db
      .insert(schema.tenantMailboxes)
      .values({
        tenantId,
        provider: "outlook",
        emailAddress: "patron@boulangerie.fr",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        config,
      })
      .returning();
    if (!row) throw new Error("mailbox insert failed");
    return row;
  }

  it("première sync : bootstrap du deltaLink sans rien ingérer", async () => {
    const row = await insertOutlookBox();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ "@odata.deltaLink": "https://graph.microsoft.com/delta?token=abc" }),
      );
    const sync = new GraphSyncService(
      ctx.db,
      fakeMailboxes,
      new EventBusService(ctx.db),
      fetchMock as unknown as typeof fetch,
    );

    const result = await sync.runOnce();

    expect(result).toMatchObject({ mailboxesProcessed: 1, emailsIngested: 0, errors: 0 });
    expect(fetchMock.mock.calls[0]?.[0] as string).toContain("$deltaToken=latest");
    const [updated] = await ctx.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.id, row.id));
    expect((updated?.config as { deltaLink?: string }).deltaLink).toContain("token=abc");
  });

  it("sync suivante : ingère les nouveaux messages et avance le deltaLink", async () => {
    const row = await insertOutlookBox({
      deltaLink: "https://graph.microsoft.com/delta?token=abc",
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            id: "msg-1",
            conversationId: "conv-1",
            subject: "Commande pain",
            bodyPreview: "Bonjour, je voudrais...",
            receivedDateTime: "2026-07-05T10:00:00Z",
            from: { emailAddress: { name: "Client", address: "client@x.fr" } },
            toRecipients: [{ emailAddress: { address: "patron@boulangerie.fr" } }],
          },
          { id: "msg-supprime", "@removed": { reason: "deleted" } },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/delta?token=def",
      }),
    );
    const sync = new GraphSyncService(
      ctx.db,
      fakeMailboxes,
      new EventBusService(ctx.db),
      fetchMock as unknown as typeof fetch,
    );

    const result = await sync.runOnce();

    expect(result).toMatchObject({ emailsIngested: 1, errors: 0 });
    const [updated] = await ctx.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.id, row.id));
    expect((updated?.config as { deltaLink?: string }).deltaLink).toContain("token=def");

    const start = Date.now();
    let events: { payload: unknown }[] = [];
    while (Date.now() - start < 1000) {
      events = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.type, "email.received"));
      if (events.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      messageId: "msg-1",
      from: "Client <client@x.fr>",
      subject: "Commande pain",
    });
  });

  it("deltaLink expiré (410) : re-bootstrap sans planter", async () => {
    const row = await insertOutlookBox({
      deltaLink: "https://graph.microsoft.com/delta?token=old",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 410 }))
      .mockResolvedValueOnce(
        jsonResponse({ "@odata.deltaLink": "https://graph.microsoft.com/delta?token=frais" }),
      );
    const sync = new GraphSyncService(
      ctx.db,
      fakeMailboxes,
      new EventBusService(ctx.db),
      fetchMock as unknown as typeof fetch,
    );

    const result = await sync.runOnce();

    expect(result.errors).toBe(0);
    const [updated] = await ctx.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.id, row.id));
    expect((updated?.config as { deltaLink?: string }).deltaLink).toContain("token=frais");
  });

  it("erreur Graph : boîte marquée error sans bloquer le run", async () => {
    const row = await insertOutlookBox({ deltaLink: "https://graph.microsoft.com/delta?token=x" });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 500 }));
    const sync = new GraphSyncService(
      ctx.db,
      fakeMailboxes,
      new EventBusService(ctx.db),
      fetchMock as unknown as typeof fetch,
    );

    const result = await sync.runOnce();

    expect(result.errors).toBe(1);
    const [updated] = await ctx.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.id, row.id));
    expect(updated?.status).toBe("error");
  });

  it("ignore les boîtes gmail/imap", async () => {
    await ctx.db.insert(schema.tenantMailboxes).values({
      tenantId,
      provider: "gmail",
      emailAddress: "g@gmail.com",
      accessToken: "t",
      refreshToken: "r",
      accessTokenExpiresAt: new Date(),
    });
    const fetchMock = vi.fn();
    const sync = new GraphSyncService(
      ctx.db,
      fakeMailboxes,
      new EventBusService(ctx.db),
      fetchMock as unknown as typeof fetch,
    );

    const result = await sync.runOnce();
    expect(result.mailboxesProcessed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
