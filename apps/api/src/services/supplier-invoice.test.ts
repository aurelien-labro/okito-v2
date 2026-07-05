import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { EventBusService } from "./event-bus.js";
import { SupplierInvoiceService } from "./supplier-invoice.js";

describe("SupplierInvoiceService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let service: SupplierInvoiceService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-supplier", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    service = new SupplierInvoiceService(ctx.db, new EventBusService(ctx.db));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  it("crée une facture reçue et publie supplier_invoice.received", async () => {
    const invoice = await service.create(tenantId, {
      supplierName: "Metro",
      invoiceNumber: "F-2026-889",
      amountCents: 45000,
      category: "matières premières",
      dueDate: new Date("2026-08-01"),
    });

    expect(invoice).toMatchObject({
      status: "received",
      supplierName: "Metro",
      amountCents: 45000,
      source: "manual",
    });

    const start = Date.now();
    let rows: { type: string }[] = [];
    while (Date.now() - start < 1000) {
      rows = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.type, "supplier_invoice.received"));
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(rows).toHaveLength(1);
  });

  it("refuse un doublon (même fournisseur + même numéro)", async () => {
    await service.create(tenantId, {
      supplierName: "Metro",
      invoiceNumber: "F-1",
      amountCents: 100,
    });
    await expect(
      service.create(tenantId, { supplierName: "Metro", invoiceNumber: "F-1", amountCents: 200 }),
    ).rejects.toMatchObject({ code: "duplicate_invoice" });
  });

  it("accepte deux factures sans numéro du même fournisseur", async () => {
    await service.create(tenantId, { supplierName: "EDF", amountCents: 100 });
    await service.create(tenantId, { supplierName: "EDF", amountCents: 200 });
    expect(await service.list(tenantId)).toHaveLength(2);
  });

  it("refuse un montant nul ou négatif", async () => {
    await expect(
      service.create(tenantId, { supplierName: "Metro", amountCents: 0 }),
    ).rejects.toThrow(/positif/);
  });

  it("cycle nominal : received → approved → paid", async () => {
    const created = await service.create(tenantId, { supplierName: "Metro", amountCents: 100 });
    const approved = await service.approve(tenantId, created.id);
    expect(approved.status).toBe("approved");
    const paid = await service.markPaid(tenantId, created.id);
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).not.toBeNull();
  });

  it("paiement direct received → paid autorisé", async () => {
    const created = await service.create(tenantId, { supplierName: "EDF", amountCents: 100 });
    const paid = await service.markPaid(tenantId, created.id);
    expect(paid.status).toBe("paid");
  });

  it("transitions interdites : paid → approved, paid → cancelled", async () => {
    const created = await service.create(tenantId, { supplierName: "Metro", amountCents: 100 });
    await service.markPaid(tenantId, created.id);
    await expect(service.approve(tenantId, created.id)).rejects.toMatchObject({
      code: "invalid_transition",
    });
    await expect(service.cancel(tenantId, created.id)).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });

  it("dispute : received → disputed, puis paiement interdit", async () => {
    const created = await service.create(tenantId, { supplierName: "Metro", amountCents: 100 });
    const disputed = await service.dispute(tenantId, created.id);
    expect(disputed.status).toBe("disputed");
    await expect(service.markPaid(tenantId, created.id)).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });

  it("list filtre par statut et isole les tenants", async () => {
    const [other] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-other", name: "Autre" })
      .returning();
    if (!other) throw new Error("tenant insert failed");
    const a = await service.create(tenantId, { supplierName: "Metro", amountCents: 100 });
    await service.create(tenantId, { supplierName: "EDF", amountCents: 200 });
    await service.create(other.id, { supplierName: "Metro", amountCents: 300 });
    await service.markPaid(tenantId, a.id);

    expect(await service.list(tenantId)).toHaveLength(2);
    expect(await service.list(tenantId, "paid")).toHaveLength(1);
    expect(await service.list(other.id)).toHaveLength(1);
  });

  it("dueSoon : renvoie les non-payées à échéance dans la fenêtre, triées", async () => {
    const now = new Date("2026-07-05T12:00:00Z");
    const inTwoDays = await service.create(tenantId, {
      supplierName: "Metro",
      amountCents: 100,
      dueDate: new Date("2026-07-07T12:00:00Z"),
    });
    await service.create(tenantId, {
      supplierName: "EDF",
      amountCents: 200,
      dueDate: new Date("2026-07-20T12:00:00Z"), // hors fenêtre
    });
    const paidSoon = await service.create(tenantId, {
      supplierName: "Engie",
      amountCents: 300,
      dueDate: new Date("2026-07-06T12:00:00Z"),
    });
    await service.markPaid(tenantId, paidSoon.id);

    const due = await service.dueSoon(tenantId, 3, now);
    expect(due).toHaveLength(1);
    expect(due[0]?.id).toBe(inTwoDays.id);
  });
});
