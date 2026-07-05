import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { VatReportService } from "./vat-report.js";

describe("VatReportService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let service: VatReportService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-tva", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    service = new VatReportService(ctx.db);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function insertSale(
    amountCents: number,
    vatRateBps: number,
    paidAt: Date,
    status = "paid",
  ) {
    await ctx.db.insert(schema.invoices).values({
      tenantId,
      number: `2026-${Math.random().toString().slice(2, 6)}`,
      status,
      customerName: "Client",
      amountCents,
      vatRateBps,
      paidAt,
    });
  }

  async function insertPurchase(
    amountCents: number,
    vatRateBps: number,
    paidAt: Date,
    status = "paid",
  ) {
    await ctx.db.insert(schema.supplierInvoices).values({
      tenantId,
      supplierName: "Metro",
      status,
      amountCents,
      vatRateBps,
      paidAt,
    });
  }

  it("calcule collectée, déductible et net, ventilés par taux", async () => {
    const july = new Date("2026-07-10T12:00:00Z");
    // Ventes : 1200 € TTC à 20% (TVA 200 €) + 110 € TTC à 10% (TVA 10 €)
    await insertSale(120_000, 2000, july);
    await insertSale(11_000, 1000, july);
    // Achats : 600 € TTC à 20% (TVA 100 €)
    await insertPurchase(60_000, 2000, july);

    const report = await service.report(tenantId, 2026, 7);

    expect(report.sales.totalGrossCents).toBe(131_000);
    expect(report.sales.totalVatCents).toBe(21_000);
    expect(report.sales.lines).toEqual([
      { rateBps: 2000, grossCents: 120_000, netCents: 100_000, vatCents: 20_000, count: 1 },
      { rateBps: 1000, grossCents: 11_000, netCents: 10_000, vatCents: 1_000, count: 1 },
    ]);
    expect(report.purchases.totalVatCents).toBe(10_000);
    expect(report.netVatCents).toBe(11_000);
  });

  it("ne compte que la période et le statut paid", async () => {
    await insertSale(120_000, 2000, new Date("2026-06-30T23:00:00Z")); // juin
    await insertSale(120_000, 2000, new Date("2026-08-01T00:00:00Z")); // août
    await insertSale(120_000, 2000, new Date("2026-07-10T12:00:00Z"), "sent"); // pas payée
    await insertPurchase(60_000, 2000, new Date("2026-07-10T12:00:00Z"), "received");

    const report = await service.report(tenantId, 2026, 7);

    expect(report.sales.totalGrossCents).toBe(0);
    expect(report.purchases.totalGrossCents).toBe(0);
    expect(report.netVatCents).toBe(0);
  });

  it("crédit de TVA quand les achats dépassent les ventes", async () => {
    const july = new Date("2026-07-15T12:00:00Z");
    await insertSale(12_000, 2000, july); // TVA 2000
    await insertPurchase(60_000, 2000, july); // TVA 10000

    const report = await service.report(tenantId, 2026, 7);
    expect(report.netVatCents).toBe(-8_000);
  });

  it("isole les tenants", async () => {
    const [other] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "autre-tva", name: "Autre" })
      .returning();
    if (!other) throw new Error("tenant insert failed");
    await ctx.db.insert(schema.invoices).values({
      tenantId: other.id,
      number: "2026-0001",
      status: "paid",
      customerName: "X",
      amountCents: 120_000,
      vatRateBps: 2000,
      paidAt: new Date("2026-07-10T12:00:00Z"),
    });

    const report = await service.report(tenantId, 2026, 7);
    expect(report.sales.totalGrossCents).toBe(0);
  });

  it("période invalide → 400", async () => {
    await expect(service.report(tenantId, 2026, 13)).rejects.toMatchObject({
      code: "invalid_period",
    });
  });
});
