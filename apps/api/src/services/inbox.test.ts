import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { InboxService } from "./inbox.js";

describe("InboxService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let svc: InboxService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-inbox", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    svc = new InboxService(ctx.db);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function seedEmail(subject: string, at: Date, from = "Marie <marie@test.fr>") {
    await ctx.db.insert(schema.events).values({
      tenantId,
      type: "email.received",
      source: "gmail",
      payload: { messageId: subject, from, subject, snippet: `Aperçu ${subject}` },
      createdAt: at,
    });
  }

  it("projette les email.received en messages, plus récent d'abord", async () => {
    await seedEmail("Ancien", new Date("2026-07-01T09:00:00Z"));
    await seedEmail("Récent", new Date("2026-07-04T09:00:00Z"));

    const page = await svc.list(tenantId);
    expect(page.messages).toHaveLength(2);
    expect(page.messages[0]).toMatchObject({
      channel: "email",
      subject: "Récent",
      from: "Marie <marie@test.fr>",
      snippet: "Aperçu Récent",
    });
    expect(page.messages[1]?.subject).toBe("Ancien");
    expect(page.nextCursor).toBeNull();
  });

  it("ignore les événements non-email", async () => {
    await ctx.db.insert(schema.events).values({
      tenantId,
      type: "reservation.created",
      payload: { id: "r1" },
    });
    await seedEmail("Un mail", new Date());
    const page = await svc.list(tenantId);
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]?.subject).toBe("Un mail");
  });

  it("pagine par curseur", async () => {
    for (let i = 0; i < 5; i++) {
      await seedEmail(`Mail ${i}`, new Date(`2026-07-0${i + 1}T09:00:00Z`));
    }
    const first = await svc.list(tenantId, { limit: 2 });
    expect(first.messages).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await svc.list(tenantId, {
      limit: 2,
      before: new Date(first.nextCursor as string),
    });
    expect(second.messages).toHaveLength(2);
    expect(second.messages[0]?.createdAt).not.toBe(first.messages[0]?.createdAt);
  });

  it("isolation tenant", async () => {
    const [other] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "autre-inbox", name: "Autre" })
      .returning();
    if (!other) throw new Error("tenant insert failed");
    await ctx.db.insert(schema.events).values({
      tenantId: other.id,
      type: "email.received",
      payload: { subject: "Pas à moi" },
    });
    await seedEmail("À moi", new Date());

    const page = await svc.list(tenantId);
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]?.subject).toBe("À moi");
  });
});
