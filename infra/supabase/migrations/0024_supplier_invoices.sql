-- =====================================================
-- OKITO V2 — Migration 0024
-- Factures fournisseurs (module Admin V3 — "Jarvis gère ta compta", volet achats).
--
-- Montants en centimes (jamais de flottant sur de l'argent). Cycle :
--   received → approved → paid | disputed | cancelled
-- (paid accessible aussi depuis received : le patron peut payer sans étape
-- d'approbation formelle). `extracted` gardera le brut de l'extraction LLM
-- quand la facture arrive par upload ou email (vague suivante).
-- =====================================================

create table if not exists supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  supplier_name text not null,
  invoice_number text,
  status text not null default 'received'
    check (status in ('received', 'approved', 'paid', 'disputed', 'cancelled')),
  amount_cents integer not null,
  currency text not null default 'EUR',
  category text,
  invoice_date timestamptz,
  due_date timestamptz,
  paid_at timestamptz,
  source text not null default 'manual'
    check (source in ('manual', 'upload', 'email')),
  extracted jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotence métier : un même numéro de facture d'un même fournisseur
-- ne peut pas entrer deux fois chez un tenant.
create unique index if not exists supplier_invoices_tenant_supplier_number_uniq
  on supplier_invoices (tenant_id, supplier_name, invoice_number)
  where invoice_number is not null;
create index if not exists supplier_invoices_tenant_status_idx
  on supplier_invoices (tenant_id, status);
create index if not exists supplier_invoices_due_idx
  on supplier_invoices (status, due_date);
