-- =====================================================
-- OKITO V2 — Migration 0023
-- Factures clients (module Admin V3 — "Jarvis gère ta compta").
--
-- Montants en centimes (jamais de flottant sur de l'argent). Numéro unique
-- par tenant. Cycle : draft → sent → paid | overdue | cancelled.
-- overdue est matérialisé par un job pour que Jarvis le détecte sans recalcul.
-- =====================================================

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  number text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  customer_name text not null,
  customer_email text,
  lines jsonb not null default '[]',
  amount_cents integer not null default 0,
  currency text not null default 'EUR',
  issued_at timestamptz,
  due_date timestamptz,
  paid_at timestamptz,
  reminders_sent integer not null default 0,
  last_reminder_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoices_tenant_number_uniq
  on invoices (tenant_id, number);
create index if not exists invoices_tenant_status_idx
  on invoices (tenant_id, status);
create index if not exists invoices_due_idx
  on invoices (status, due_date);
