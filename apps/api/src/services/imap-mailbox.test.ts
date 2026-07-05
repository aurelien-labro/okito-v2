import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SecretBox } from "../lib/secret-box.js";
import {
  type ImapConfig,
  type ImapConnection,
  type ImapConnectionFactory,
  ImapMailboxService,
} from "./imap-mailbox.js";

const KEY = "b".repeat(64);

function fakeConnection(
  inbox = { uidValidity: "1111", uidNext: 43 },
): ImapConnection & { close: ReturnType<typeof vi.fn> } {
  return {
    openInbox: vi.fn().mockResolvedValue(inbox),
    fetchSince: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ImapMailboxService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-imap", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("connecte une boîte IMAP : vérifie les identifiants, chiffre le mot de passe, initialise le curseur", async () => {
    const conn = fakeConnection();
    const factory: ImapConnectionFactory = vi.fn().mockResolvedValue(conn);
    const service = new ImapMailboxService(ctx.db, new SecretBox(KEY), factory);

    const safe = await service.addMailbox(tenantId, {
      provider: "imap",
      host: "imap.ovh.net",
      user: "contact@resto.fr",
      password: "s3cret",
    });

    expect(safe).toMatchObject({ provider: "imap", emailAddress: "contact@resto.fr" });
    // Le mot de passe ne sort jamais, même chiffré.
    expect(JSON.stringify(safe)).not.toContain("passwordEnc");
    expect(JSON.stringify(safe)).not.toContain("s3cret");
    expect(conn.close).toHaveBeenCalled();

    const [row] = await ctx.db
      .select()
      .from(schema.tenantMailboxes)
      .where(eq(schema.tenantMailboxes.tenantId, tenantId));
    const config = row?.config as unknown as ImapConfig;
    expect(config.uidValidity).toBe("1111");
    expect(config.lastUid).toBe(42);
    expect(config.passwordEnc).not.toContain("s3cret");
    expect(service.decryptPassword(config)).toBe("s3cret");
  });

  it("yahoo : host imposé, pas besoin de le fournir", async () => {
    const factory = vi.fn().mockResolvedValue(fakeConnection());
    const service = new ImapMailboxService(ctx.db, new SecretBox(KEY), factory);

    await service.addMailbox(tenantId, {
      provider: "yahoo",
      user: "resto@yahoo.fr",
      password: "app-pass",
    });

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.mail.yahoo.com", port: 993, secure: true }),
    );
  });

  it("identifiants refusés → 400 imap_auth_failed, rien en base", async () => {
    const factory: ImapConnectionFactory = vi.fn().mockRejectedValue(new Error("AUTH failed"));
    const service = new ImapMailboxService(ctx.db, new SecretBox(KEY), factory);

    await expect(
      service.addMailbox(tenantId, {
        provider: "imap",
        host: "imap.ovh.net",
        user: "x@y.fr",
        password: "faux",
      }),
    ).rejects.toMatchObject({ code: "imap_auth_failed" });
    expect(await service.list(tenantId)).toHaveLength(0);
  });

  it("imap sans host → 400", async () => {
    const service = new ImapMailboxService(ctx.db, new SecretBox(KEY), vi.fn());
    await expect(
      service.addMailbox(tenantId, { provider: "imap", user: "x@y.fr", password: "p" }),
    ).rejects.toMatchObject({ code: "imap_host_required" });
  });
});
