import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Factures clients émises par un tenant (module Admin V3).
 *
 * Montants en centimes (pas de flottant sur de l'argent). Le numéro est
 * unique par tenant (séquence gérée applicativement). Le cycle de vie :
 *   draft → sent → paid | overdue | cancelled
 * overdue est dérivé (dueDate passée + statut sent) mais matérialisé par un
 * job pour que Jarvis puisse le détecter sans recalcul.
 */
export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface InvoiceLine {
  label: string;
  quantity: number;
  unitPriceCents: number;
}

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Numéro lisible, unique par tenant, ex: "2026-0042". */
    number: text("number").notNull(),
    status: text("status", { enum: INVOICE_STATUSES }).notNull().default("draft"),

    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email"),

    lines: jsonb("lines").notNull().default([]),
    /** Total TTC en centimes (somme des lignes). Stocké pour tri/filtre rapides. */
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("EUR"),
    /** Taux de TVA en basis points (2000 = 20%). Montants stockes TTC. */
    vatRateBps: integer("vat_rate_bps").notNull().default(2000),

    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Nombre de relances déjà envoyées (par Jarvis ou manuellement). */
    remindersSent: integer("reminders_sent").notNull().default(0),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoices_tenant_status_idx").on(t.tenantId, t.status),
    index("invoices_tenant_number_idx").on(t.tenantId, t.number),
    index("invoices_due_idx").on(t.status, t.dueDate),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
