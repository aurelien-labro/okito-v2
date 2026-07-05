import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SecretBox } from "../lib/secret-box.js";
import { EventBusService } from "./event-bus.js";
import { type ImapConfig, type ImapConnection, ImapMailboxService } from "./imap-mailbox.js";
import { ImapSyncService } from "./imap-sync.js";

const KEY = "c".repeat(64);

describe("ImapSyncService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let box: SecretBox;

  beforeEach(async () => {
    ctx = await createTestDb();
    box = new SecretBox(KEY);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-imapsync", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function insertImapBox(config: Partial<ImapConfig> = {}, provider = "imap") {
    const full: ImapConfig = {
      host: "imap.ovh.net",
      port: 993,
      secure: true,
      user: "contact@resto.fr",
      passwordEnc: box.encrypt("s3cret"),
      uidValidity: "1111",
      lastUid: 42,
      ...config,
    };
    const [row] = await ctx.db
      .insert(schema.tenantMailboxes)
      .values({
        tenantId,
        provider,
        emailAddress: "contact@resto.fr",
        config: full,
      })
      .returning();
    if (!row) throw new Error("insert mailbox failed");
    return row;
  }

  function service(conn: ImapConnection) {
    const mailboxes = new ImapMailboxService(ctx.db, box, vi.fn());
    return new ImapSyncService(
      ctx.db,
      mailboxes,
      new EventBusService(ctx.db),
      vi.fn().mockResolvedValue(conn),
    );
  }

  it("ingère les nouveaux messages et avance le curseur", async () => {
    const row = await insertImapBox();
    const conn: ImapConnection = {
      openInbox: vi.fn().mockResolvedValue({ uidValidity: "1111", uidNext: 45 }),
      fetchSince: vi.fn().mockResolvedValue([
        {
          uid: 43,
          from: "Client <client@x.fr>",
          to: "contact@resto.fr",
          subject: "Devis",
          date: new Date("2026-07-05T10:00:00Z"),
        },
        { uid: 44, from: "EDF <no@edf.fr>", to: null, subject: "Facture", date: null },
      ]),
      close: vi.fn(),
    };

    const result = await service(conn).runOnce();

    expect(result).toMatchObject({ mailboxesProcessed: 1, emailsIngested: 2, errors: 0 });
    expect(conn.fetchSince).toHaveBeenCalledWith(42);

    const [updated] = await ctx.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.id, row.id));
    expect((updated?.config as unknown as ImapConfig).lastUid).toBe(44);
    expect(updated?.lastSyncAt).not.toBeNull();

    // Les events email.received sont sur le bus (insert fire-and-forget).
    const start = Date.now();
    let events: { payload: unknown }[] = [];
    while (Date.now() - start < 1000) {
      events = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.type, "email.received"));
      if (events.length >= 2) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(events).toHaveLength(2);
    expect(events.map((e) => (e.payload as { subject: string }).subject).sort()).toEqual([
      "Devis",
      "Facture",
    ]);
  });

  it("UIDVALIDITY changé → re-bootstrap du curseur sans réingérer", async () => {
    const row = await insertImapBox({ uidValidity: "1111", lastUid: 42 });
    const conn: ImapConnection = {
      openInbox: vi.fn().mockResolvedValue({ uidValidity: "9999", uidNext: 100 }),
      fetchSince: vi.fn(),
      close: vi.fn(),
    };

    const result = await service(conn).runOnce();

    expect(result.emailsIngested).toBe(0);
    expect(conn.fetchSince).not.toHaveBeenCalled();
    const [updated] = await ctx.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.id, row.id));
    const config = updated?.config as unknown as ImapConfig;
    expect(config.uidValidity).toBe("9999");
    expect(config.lastUid).toBe(99);
  });

  it("boîte en erreur : marquée error, les autres continuent", async () => {
    const bad = await insertImapBox();
    await insertImapBox({}, "yahoo");
    let calls = 0;
    const sync = new ImapSyncService(
      ctx.db,
      new ImapMailboxService(ctx.db, box, vi.fn()),
      new EventBusService(ctx.db),
      vi.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) throw new Error("connexion refusée");
        return {
          openInbox: vi.fn().mockResolvedValue({ uidValidity: "1111", uidNext: 43 }),
          fetchSince: vi.fn().mockResolvedValue([]),
          close: vi.fn(),
        };
      }),
    );

    const result = await sync.runOnce();

    expect(result).toMatchObject({ mailboxesProcessed: 2, errors: 1 });
    const [badRow] = await ctx.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.id, bad.id));
    expect(badRow?.status).toBe("error");
    expect(badRow?.lastError).toContain("connexion refusée");
  });

  it("ignore les boîtes gmail et les boîtes en pause", async () => {
    await ctx.db.insert(schema.tenantMailboxes).values({
      tenantId,
      provider: "gmail",
      emailAddress: "g@gmail.com",
      accessToken: "t",
      refreshToken: "r",
      accessTokenExpiresAt: new Date(),
    });
    await insertImapBox({}, "imap").then((row) =>
      ctx.db
        .update(schema.tenantMailboxes)
        .set({ status: "paused" })
        .where(eq(schema.tenantMailboxes.id, row.id)),
    );
    const connect = vi.fn();

    const sync = new ImapSyncService(
      ctx.db,
      new ImapMailboxService(ctx.db, box, vi.fn()),
      new EventBusService(ctx.db),
      connect,
    );
    const result = await sync.runOnce();

    expect(result.mailboxesProcessed).toBe(0);
    expect(connect).not.toHaveBeenCalled();
  });
});
