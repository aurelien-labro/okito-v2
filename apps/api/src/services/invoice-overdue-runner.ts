import type { Database } from "@okito/db";
import type { InvoiceService } from "./invoice.js";

export interface InvoiceOverdueRunResult {
  tenantsProcessed: number;
  marked: number;
}

/**
 * Runner cron : bascule en overdue les factures échues de tous les tenants.
 * Sépare l'itération multi-tenant de la logique métier (InvoiceService reste
 * scopé par tenant). Chaque invoice.overdue publié devient un signal Observer.
 */
export class InvoiceOverdueRunner {
  constructor(
    private readonly db: Database,
    private readonly invoices: InvoiceService,
  ) {}

  async runOnce(now = new Date()): Promise<InvoiceOverdueRunResult> {
    const result: InvoiceOverdueRunResult = { tenantsProcessed: 0, marked: 0 };
    const tenants = await this.db.query.tenants.findMany({ columns: { id: true } });
    for (const tenant of tenants) {
      const marked = await this.invoices.markOverdue(tenant.id, now);
      if (marked > 0) result.tenantsProcessed++;
      result.marked += marked;
    }
    return result;
  }
}
