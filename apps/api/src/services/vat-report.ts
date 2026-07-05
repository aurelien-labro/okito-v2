import { type Database, schema } from "@okito/db";
import { and, eq, gte, lt } from "drizzle-orm";
import { BadRequestError } from "../lib/errors.js";

/** Une ligne de ventilation par taux de TVA (montants en centimes). */
export interface VatRateLine {
  rateBps: number;
  grossCents: number;
  netCents: number;
  vatCents: number;
  count: number;
}

export interface VatReport {
  period: { year: number; month: number; fromIso: string; toIso: string };
  /** TVA collectée — factures clients encaissées (paid_at) dans la période. */
  sales: { lines: VatRateLine[]; totalVatCents: number; totalGrossCents: number };
  /** TVA déductible — factures fournisseurs payées dans la période. */
  purchases: { lines: VatRateLine[]; totalVatCents: number; totalGrossCents: number };
  /** Collectée − déductible. Positif = à reverser, négatif = crédit de TVA. */
  netVatCents: number;
}

/**
 * Préparation de la déclaration de TVA (vague 3) — PAS une télédéclaration.
 *
 * Régime encaissements, période mensuelle : ventes = factures clients avec
 * paid_at dans le mois, achats = factures fournisseurs avec paid_at dans le
 * mois. Montants stockés TTC ; HT et TVA dérivés du taux par facture
 * (vat_rate_bps) : HT = TTC / (1 + taux), TVA = TTC − HT, arrondis au
 * centime par facture (comme le ferait un livre de recettes).
 *
 * Le rapport est un dossier à faire VALIDER par le comptable — le bandeau
 * côté dashboard le rappelle.
 */
export class VatReportService {
  constructor(private readonly db: Database) {}

  async report(tenantId: string, year: number, month: number): Promise<VatReport> {
    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      throw new BadRequestError("Période invalide", "invalid_period");
    }
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));

    const [sales, purchases] = await Promise.all([
      this.db
        .select({
          amountCents: schema.invoices.amountCents,
          vatRateBps: schema.invoices.vatRateBps,
        })
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.tenantId, tenantId),
            eq(schema.invoices.status, "paid"),
            gte(schema.invoices.paidAt, from),
            lt(schema.invoices.paidAt, to),
          ),
        ),
      this.db
        .select({
          amountCents: schema.supplierInvoices.amountCents,
          vatRateBps: schema.supplierInvoices.vatRateBps,
        })
        .from(schema.supplierInvoices)
        .where(
          and(
            eq(schema.supplierInvoices.tenantId, tenantId),
            eq(schema.supplierInvoices.status, "paid"),
            gte(schema.supplierInvoices.paidAt, from),
            lt(schema.supplierInvoices.paidAt, to),
          ),
        ),
    ]);

    const salesAgg = aggregate(sales);
    const purchasesAgg = aggregate(purchases);

    return {
      period: { year, month, fromIso: from.toISOString(), toIso: to.toISOString() },
      sales: salesAgg,
      purchases: purchasesAgg,
      netVatCents: salesAgg.totalVatCents - purchasesAgg.totalVatCents,
    };
  }
}

function aggregate(rows: Array<{ amountCents: number; vatRateBps: number }>): {
  lines: VatRateLine[];
  totalVatCents: number;
  totalGrossCents: number;
} {
  const byRate = new Map<number, VatRateLine>();
  for (const row of rows) {
    const line = byRate.get(row.vatRateBps) ?? {
      rateBps: row.vatRateBps,
      grossCents: 0,
      netCents: 0,
      vatCents: 0,
      count: 0,
    };
    // HT arrondi au centime par facture : TTC / (1 + taux).
    const netCents = Math.round((row.amountCents * 10_000) / (10_000 + row.vatRateBps));
    line.grossCents += row.amountCents;
    line.netCents += netCents;
    line.vatCents += row.amountCents - netCents;
    line.count++;
    byRate.set(row.vatRateBps, line);
  }
  const lines = [...byRate.values()].sort((a, b) => b.rateBps - a.rateBps);
  return {
    lines,
    totalVatCents: lines.reduce((sum, l) => sum + l.vatCents, 0),
    totalGrossCents: lines.reduce((sum, l) => sum + l.grossCents, 0),
  };
}
