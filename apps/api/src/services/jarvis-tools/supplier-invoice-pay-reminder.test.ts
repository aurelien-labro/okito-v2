import { type JarvisAction, schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../../tests/_helpers/pg.js";
import type { Notifier } from "../notifier.js";
import { SupplierInvoiceService } from "../supplier-invoice.js";
import { SupplierInvoicePayReminderTool } from "./supplier-invoice-pay-reminder.js";

function fakeNotifier(delivered = true): Notifier & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn().mockResolvedValue({ delivered, provider: "fake" }),
    notifyReservationCreated: vi.fn(),
    notifyReservationCancelled: vi.fn(),
  };
}

function actionFor(tenantId: string, supplierInvoiceId: string): JarvisAction {
  return {
    id: "00000000-0000-4000-8000-00000000000a",
    tenantId,
    type: "supplier_invoice.pay_reminder",
    summary: "Payer Metro",
    policy: "auto_cancellable",
    status: "scheduled",
    payload: { supplierInvoiceId },
    result: null,
    cancellableUntil: null,
    createdAt: new Date(),
    executedAt: null,
    cancelledAt: null,
  } as JarvisAction;
}

describe("SupplierInvoicePayReminderTool", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let service: SupplierInvoiceService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-payrem", name: "Resto", contactEmail: "patron@resto.fr" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    service = new SupplierInvoiceService(ctx.db);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("envoie le rappel email au patron avec montant et échéance", async () => {
    const invoice = await service.create(tenantId, {
      supplierName: "Metro",
      invoiceNumber: "F-42",
      amountCents: 45050,
      dueDate: new Date("2026-07-08T00:00:00Z"),
      category: "matières premières",
    });
    const notifier = fakeNotifier();
    const tool = new SupplierInvoicePayReminderTool(ctx.db, notifier, service);

    const result = await tool.execute(actionFor(tenantId, invoice.id));

    expect(result).toMatchObject({ sentTo: "patron@resto.fr", supplier: "Metro" });
    expect(notifier.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "email",
        to: "patron@resto.fr",
        subject: expect.stringContaining("Metro"),
        body: expect.stringContaining("F-42"),
      }),
    );
  });

  it("échoue si la facture est déjà payée", async () => {
    const invoice = await service.create(tenantId, { supplierName: "EDF", amountCents: 100 });
    await service.markPaid(tenantId, invoice.id);
    const tool = new SupplierInvoicePayReminderTool(ctx.db, fakeNotifier(), service);

    await expect(tool.execute(actionFor(tenantId, invoice.id))).rejects.toThrow(/déjà traitée/);
  });

  it("échoue si le tenant n'a pas d'email de contact", async () => {
    const [noMail] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-nomail", name: "Sans email" })
      .returning();
    if (!noMail) throw new Error("tenant insert failed");
    const invoice = await service.create(noMail.id, { supplierName: "Metro", amountCents: 100 });
    const tool = new SupplierInvoicePayReminderTool(ctx.db, fakeNotifier(), service);

    await expect(tool.execute(actionFor(noMail.id, invoice.id))).rejects.toThrow(
      /email de contact/,
    );
  });
});
