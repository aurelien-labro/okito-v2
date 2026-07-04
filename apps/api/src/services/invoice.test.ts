import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { BadRequestError, HttpError, NotFoundError } from "../lib/errors.js";
import { EventBusService } from "./event-bus.js";
import { InvoiceService } from "./invoice.js";

describe("InvoiceService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let svc: InvoiceService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-invoice", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    svc = new InvoiceService(ctx.db, new EventBusService(ctx.db));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  const oneLine = [{ label: "Prestation", quantity: 2, unitPriceCents: 5000 }];

  it("create : calcule le total, numérote par année, statut draft", async () => {
    const inv = await svc.create(tenantId, { customerName: "Traiteur Lebon", lines: oneLine });
    expect(inv).toMatchObject({
      status: "draft",
      amountCents: 10000,
      customerName: "Traiteur Lebon",
    });
    expect(inv.number).toMatch(/^\d{4}-0001$/);

    const inv2 = await svc.create(tenantId, { customerName: "Autre", lines: oneLine });
    expect(inv2.number).toMatch(/^\d{4}-0002$/);
  });

  it("create : refuse sans ligne ou montant nul", async () => {
    await expect(svc.create(tenantId, { customerName: "X", lines: [] })).rejects.toThrow(
      BadRequestError,
    );
    await expect(
      svc.create(tenantId, {
        customerName: "X",
        lines: [{ label: "gratuit", quantity: 1, unitPriceCents: 0 }],
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it("send : draft → sent avec issued_at et due_date", async () => {
    const inv = await svc.create(tenantId, { customerName: "X", lines: oneLine });
    const sent = await svc.send(tenantId, inv.id, 30);
    expect(sent.status).toBe("sent");
    expect(sent.issuedAt).toBeInstanceOf(Date);
    expect(sent.dueDate).toBeInstanceOf(Date);
    expect((sent.dueDate as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("markPaid : sent → paid, refuse depuis draft", async () => {
    const inv = await svc.create(tenantId, { customerName: "X", lines: oneLine });
    await expect(svc.markPaid(tenantId, inv.id)).rejects.toThrow(HttpError);
    await svc.send(tenantId, inv.id);
    const paid = await svc.markPaid(tenantId, inv.id);
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).toBeInstanceOf(Date);
  });

  it("markOverdue : bascule les factures sent échues + publie invoice.overdue", async () => {
    const inv = await svc.create(tenantId, { customerName: "X", lines: oneLine });
    await svc.send(tenantId, inv.id, 30);
    // force la due_date dans le passé
    await ctx.db
      .update(schema.invoices)
      .set({ dueDate: new Date(Date.now() - 86_400_000) })
      .where(eq(schema.invoices.id, inv.id));

    const count = await svc.markOverdue(tenantId);
    expect(count).toBe(1);
    const reloaded = await svc.get(tenantId, inv.id);
    expect(reloaded.status).toBe("overdue");

    const start = Date.now();
    let events: { type: string }[] = [];
    while (Date.now() - start < 1000) {
      events = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.type, "invoice.overdue"));
      if (events.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(events).toHaveLength(1);
  });

  it("markOverdue : n'affecte pas une facture non échue", async () => {
    const inv = await svc.create(tenantId, { customerName: "X", lines: oneLine });
    await svc.send(tenantId, inv.id, 30);
    expect(await svc.markOverdue(tenantId)).toBe(0);
  });

  it("recordReminder : incrémente le compteur", async () => {
    const inv = await svc.create(tenantId, { customerName: "X", lines: oneLine });
    await svc.send(tenantId, inv.id);
    const r1 = await svc.recordReminder(tenantId, inv.id);
    expect(r1.remindersSent).toBe(1);
    expect(r1.lastReminderAt).toBeInstanceOf(Date);
    const r2 = await svc.recordReminder(tenantId, inv.id);
    expect(r2.remindersSent).toBe(2);
  });

  it("isolation tenant : facture d'un autre tenant introuvable", async () => {
    const [other] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "autre-inv", name: "Autre" })
      .returning();
    if (!other) throw new Error("tenant insert failed");
    const inv = await svc.create(other.id, { customerName: "X", lines: oneLine });
    await expect(svc.get(tenantId, inv.id)).rejects.toThrow(NotFoundError);
    expect(await svc.list(tenantId)).toHaveLength(0);
  });
});
