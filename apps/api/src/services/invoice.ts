import { type Database, type Invoice, type InvoiceLine, schema } from "@okito/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { BadRequestError, HttpError, NotFoundError } from "../lib/errors.js";
import type { EventBusService } from "./event-bus.js";

class InvalidTransitionError extends HttpError {
  constructor(from: string, to: string) {
    super(409, "invalid_transition", `Transition facture ${from} → ${to} interdite.`);
  }
}

export interface InvoiceCreateInput {
  customerName: string;
  customerEmail?: string | null;
  lines: InvoiceLine[];
  currency?: string;
  /** Taux de TVA en basis points (2000 = 20%). */
  vatRateBps?: number;
  dueInDays?: number;
  notes?: string | null;
}

function lineTotal(l: InvoiceLine): number {
  return Math.round(l.quantity * l.unitPriceCents);
}

/**
 * Factures clients (module Admin V3).
 *
 * Émission → envoi → paiement, avec numérotation séquentielle par tenant
 * et par année ("2026-0001"). Chaque transition significative est publiée
 * sur l'event bus pour que Jarvis la voie (invoice.created, invoice.sent,
 * invoice.paid). Le passage en overdue est fait par markOverdue (job).
 */
export class InvoiceService {
  constructor(
    private readonly db: Database,
    private readonly bus?: EventBusService,
  ) {}

  async create(tenantId: string, input: InvoiceCreateInput): Promise<Invoice> {
    if (input.lines.length === 0)
      throw new BadRequestError("Au moins une ligne de facture requise");
    const amountCents = input.lines.reduce((sum, l) => sum + lineTotal(l), 0);
    if (amountCents <= 0) throw new BadRequestError("Le montant total doit être positif");

    const number = await this.nextNumber(tenantId);
    const [row] = await this.db
      .insert(schema.invoices)
      .values({
        tenantId,
        number,
        status: "draft",
        customerName: input.customerName,
        customerEmail: input.customerEmail ?? null,
        lines: input.lines,
        amountCents,
        currency: input.currency ?? "EUR",
        vatRateBps: input.vatRateBps ?? 2000,
        notes: input.notes ?? null,
      })
      .returning();
    if (!row) throw new Error("insert invoice failed");
    this.publish(row, "invoice.created");
    return row;
  }

  /** Émet la facture : draft → sent, fixe issued_at et due_date. */
  async send(tenantId: string, id: string, dueInDays = 30): Promise<Invoice> {
    const invoice = await this.get(tenantId, id);
    if (invoice.status !== "draft") throw new InvalidTransitionError(invoice.status, "sent");
    const now = new Date();
    const row = await this.patch(tenantId, id, {
      status: "sent",
      issuedAt: now,
      dueDate: new Date(now.getTime() + dueInDays * 86_400_000),
    });
    this.publish(row, "invoice.sent");
    return row;
  }

  /** Marque payée : sent|overdue → paid. */
  async markPaid(tenantId: string, id: string): Promise<Invoice> {
    const invoice = await this.get(tenantId, id);
    if (invoice.status !== "sent" && invoice.status !== "overdue") {
      throw new InvalidTransitionError(invoice.status, "paid");
    }
    const row = await this.patch(tenantId, id, { status: "paid", paidAt: new Date() });
    this.publish(row, "invoice.paid");
    return row;
  }

  async cancel(tenantId: string, id: string): Promise<Invoice> {
    const invoice = await this.get(tenantId, id);
    if (invoice.status === "paid") throw new InvalidTransitionError("paid", "cancelled");
    return this.patch(tenantId, id, { status: "cancelled" });
  }

  /** Incrémente le compteur de relances (appelé par le tool Jarvis ou manuellement). */
  async recordReminder(tenantId: string, id: string): Promise<Invoice> {
    const invoice = await this.get(tenantId, id);
    return this.patch(tenantId, id, {
      remindersSent: invoice.remindersSent + 1,
      lastReminderAt: new Date(),
    });
  }

  /**
   * Bascule en overdue les factures sent dont la due_date est passée.
   * Publie invoice.overdue par facture — c'est le signal que l'Observer
   * consomme pour proposer une relance. Retourne le nombre basculé.
   */
  async markOverdue(tenantId: string, now = new Date()): Promise<number> {
    const stale = await this.db
      .select()
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.tenantId, tenantId),
          eq(schema.invoices.status, "sent"),
          sql`${schema.invoices.dueDate} < ${now}`,
        ),
      );
    for (const invoice of stale) {
      const row = await this.patch(tenantId, invoice.id, { status: "overdue" });
      this.publish(row, "invoice.overdue");
    }
    return stale.length;
  }

  async list(tenantId: string, status?: Invoice["status"]): Promise<Invoice[]> {
    const conditions = [eq(schema.invoices.tenantId, tenantId)];
    if (status) conditions.push(eq(schema.invoices.status, status));
    return this.db
      .select()
      .from(schema.invoices)
      .where(and(...conditions))
      .orderBy(desc(schema.invoices.createdAt));
  }

  async get(tenantId: string, id: string): Promise<Invoice> {
    const [row] = await this.db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.tenantId, tenantId), eq(schema.invoices.id, id)));
    if (!row) throw new NotFoundError("Facture introuvable");
    return row;
  }

  private async nextNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const [agg] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.tenantId, tenantId),
          sql`${schema.invoices.number} like ${`${year}-%`}`,
        ),
      );
    const seq = (agg?.count ?? 0) + 1;
    return `${year}-${String(seq).padStart(4, "0")}`;
  }

  private async patch(
    tenantId: string,
    id: string,
    values: Partial<typeof schema.invoices.$inferInsert>,
  ): Promise<Invoice> {
    const [row] = await this.db
      .update(schema.invoices)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(schema.invoices.tenantId, tenantId), eq(schema.invoices.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Facture introuvable");
    return row;
  }

  private publish(invoice: Invoice, type: string): void {
    this.bus?.publish(invoice.tenantId, type, {
      invoiceId: invoice.id,
      number: invoice.number,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      customerName: invoice.customerName,
      status: invoice.status,
    });
  }
}
