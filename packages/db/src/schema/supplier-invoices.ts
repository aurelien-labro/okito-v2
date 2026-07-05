import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Factures fournisseurs (module Admin V3, volet achats).
 *
 * Montants en centimes. Cycle : received → approved → paid | disputed | cancelled,
 * avec received → paid autorisé (paiement direct sans approbation formelle).
 * `extracted` garde le brut de l'extraction LLM pour les factures arrivées
 * par upload ou email.
 */
export const SUPPLIER_INVOICE_STATUSES = [
  "received",
  "approved",
  "paid",
  "disputed",
  "cancelled",
] as const;
export type SupplierInvoiceStatus = (typeof SUPPLIER_INVOICE_STATUSES)[number];

export const SUPPLIER_INVOICE_SOURCES = ["manual", "upload", "email"] as const;
export type SupplierInvoiceSource = (typeof SUPPLIER_INVOICE_SOURCES)[number];

export const supplierInvoices = pgTable(
  "supplier_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    supplierName: text("supplier_name").notNull(),
    /** Numéro porté par la facture du fournisseur (pas une séquence à nous). */
    invoiceNumber: text("invoice_number"),
    status: text("status", { enum: SUPPLIER_INVOICE_STATUSES }).notNull().default("received"),

    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    /** Taux de TVA en basis points (2000 = 20%). Montants stockes TTC. */
    vatRateBps: integer("vat_rate_bps").notNull().default(2000),
    /** Catégorie compta libre : "matières premières", "loyer", "énergie"… */
    category: text("category"),

    invoiceDate: timestamp("invoice_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),

    source: text("source", { enum: SUPPLIER_INVOICE_SOURCES }).notNull().default("manual"),
    /** Brut de l'extraction LLM (upload/email) pour audit et re-vérification. */
    extracted: jsonb("extracted"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("supplier_invoices_tenant_supplier_number_uniq")
      .on(t.tenantId, t.supplierName, t.invoiceNumber)
      .where(sql`${t.invoiceNumber} is not null`),
    index("supplier_invoices_tenant_status_idx").on(t.tenantId, t.status),
    index("supplier_invoices_due_idx").on(t.status, t.dueDate),
  ],
);

export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type NewSupplierInvoice = typeof supplierInvoices.$inferInsert;
