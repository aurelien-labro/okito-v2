import { type Database, type SupplierInvoice, schema } from "@okito/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { BadRequestError, HttpError, NotFoundError } from "../lib/errors.js";
import type { EventBusService } from "./event-bus.js";

class InvalidTransitionError extends HttpError {
  constructor(from: string, to: string) {
    super(409, "invalid_transition", `Transition facture fournisseur ${from} → ${to} interdite.`);
  }
}

export interface SupplierInvoiceCreateInput {
  supplierName: string;
  invoiceNumber?: string | null;
  amountCents: number;
  currency?: string;
  category?: string | null;
  invoiceDate?: Date | null;
  dueDate?: Date | null;
  notes?: string | null;
}

/**
 * Factures fournisseurs (module Admin V3, volet achats).
 *
 * Cycle : received → approved → paid | disputed | cancelled, avec
 * received → paid autorisé (paiement direct). Chaque transition est publiée
 * sur le bus (supplier_invoice.received/approved/paid/disputed) pour que
 * Jarvis la voie — l'Observer proposera un rappel avant échéance (vague
 * suivante) sur la base de dueSoon().
 */
export class SupplierInvoiceService {
  constructor(
    private readonly db: Database,
    private readonly bus?: EventBusService,
  ) {}

  async create(tenantId: string, input: SupplierInvoiceCreateInput): Promise<SupplierInvoice> {
    if (input.amountCents <= 0) throw new BadRequestError("Le montant doit être positif");
    if (input.invoiceNumber) {
      const dup = await this.db.query.supplierInvoices.findFirst({
        columns: { id: true },
        where: (t, { and: whereAnd, eq: whereEq }) =>
          whereAnd(
            whereEq(t.tenantId, tenantId),
            whereEq(t.supplierName, input.supplierName),
            whereEq(t.invoiceNumber, input.invoiceNumber as string),
          ),
      });
      if (dup) {
        throw new BadRequestError(
          `La facture ${input.invoiceNumber} de ${input.supplierName} existe déjà`,
          "duplicate_invoice",
        );
      }
    }

    const [row] = await this.db
      .insert(schema.supplierInvoices)
      .values({
        tenantId,
        supplierName: input.supplierName,
        invoiceNumber: input.invoiceNumber ?? null,
        amountCents: input.amountCents,
        currency: input.currency ?? "EUR",
        category: input.category ?? null,
        invoiceDate: input.invoiceDate ?? null,
        dueDate: input.dueDate ?? null,
        notes: input.notes ?? null,
        source: "manual",
      })
      .returning();
    if (!row) throw new Error("insert supplier invoice failed");
    this.publish(row, "supplier_invoice.received");
    return row;
  }

  /** Approuve : received → approved (le patron valide la dépense). */
  async approve(tenantId: string, id: string): Promise<SupplierInvoice> {
    const invoice = await this.get(tenantId, id);
    if (invoice.status !== "received") throw new InvalidTransitionError(invoice.status, "approved");
    const row = await this.patch(tenantId, id, { status: "approved" });
    this.publish(row, "supplier_invoice.approved");
    return row;
  }

  /** Marque payée : received|approved → paid. */
  async markPaid(tenantId: string, id: string): Promise<SupplierInvoice> {
    const invoice = await this.get(tenantId, id);
    if (invoice.status !== "received" && invoice.status !== "approved") {
      throw new InvalidTransitionError(invoice.status, "paid");
    }
    const row = await this.patch(tenantId, id, { status: "paid", paidAt: new Date() });
    this.publish(row, "supplier_invoice.paid");
    return row;
  }

  /** Conteste : received|approved → disputed (montant faux, litige fournisseur…). */
  async dispute(tenantId: string, id: string): Promise<SupplierInvoice> {
    const invoice = await this.get(tenantId, id);
    if (invoice.status !== "received" && invoice.status !== "approved") {
      throw new InvalidTransitionError(invoice.status, "disputed");
    }
    const row = await this.patch(tenantId, id, { status: "disputed" });
    this.publish(row, "supplier_invoice.disputed");
    return row;
  }

  async cancel(tenantId: string, id: string): Promise<SupplierInvoice> {
    const invoice = await this.get(tenantId, id);
    if (invoice.status === "paid") throw new InvalidTransitionError("paid", "cancelled");
    return this.patch(tenantId, id, { status: "cancelled" });
  }

  async list(tenantId: string, status?: SupplierInvoice["status"]): Promise<SupplierInvoice[]> {
    const conditions = [eq(schema.supplierInvoices.tenantId, tenantId)];
    if (status) conditions.push(eq(schema.supplierInvoices.status, status));
    return this.db
      .select()
      .from(schema.supplierInvoices)
      .where(and(...conditions))
      .orderBy(desc(schema.supplierInvoices.createdAt));
  }

  async get(tenantId: string, id: string): Promise<SupplierInvoice> {
    const [row] = await this.db
      .select()
      .from(schema.supplierInvoices)
      .where(
        and(eq(schema.supplierInvoices.tenantId, tenantId), eq(schema.supplierInvoices.id, id)),
      );
    if (!row) throw new NotFoundError("Facture fournisseur introuvable");
    return row;
  }

  /**
   * Factures non payées dont l'échéance tombe dans les `days` prochains jours.
   * C'est le signal que l'Observer consommera pour proposer un rappel de
   * paiement au patron.
   */
  async dueSoon(tenantId: string, days = 3, now = new Date()): Promise<SupplierInvoice[]> {
    const horizon = new Date(now.getTime() + days * 86_400_000);
    return this.db
      .select()
      .from(schema.supplierInvoices)
      .where(
        and(
          eq(schema.supplierInvoices.tenantId, tenantId),
          sql`${schema.supplierInvoices.status} in ('received', 'approved')`,
          gte(schema.supplierInvoices.dueDate, now),
          lte(schema.supplierInvoices.dueDate, horizon),
        ),
      )
      .orderBy(schema.supplierInvoices.dueDate);
  }

  private async patch(
    tenantId: string,
    id: string,
    values: Partial<typeof schema.supplierInvoices.$inferInsert>,
  ): Promise<SupplierInvoice> {
    const [row] = await this.db
      .update(schema.supplierInvoices)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(eq(schema.supplierInvoices.tenantId, tenantId), eq(schema.supplierInvoices.id, id)),
      )
      .returning();
    if (!row) throw new NotFoundError("Facture fournisseur introuvable");
    return row;
  }

  private publish(invoice: SupplierInvoice, type: string): void {
    this.bus?.publish(invoice.tenantId, type, {
      supplierInvoiceId: invoice.id,
      supplierName: invoice.supplierName,
      invoiceNumber: invoice.invoiceNumber,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      category: invoice.category,
      dueDate: invoice.dueDate?.toISOString() ?? null,
      status: invoice.status,
    });
  }
}
