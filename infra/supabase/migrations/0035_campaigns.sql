-- =====================================================
-- OKITO V3 — Migration 0035
-- Marketing (vague 3) : campagnes segmentées email / WhatsApp.
--
-- Une ligne = une campagne. Les segments sont calculés à la volée depuis les
-- réservations (même parti pris que la fidélité : zéro double-écriture) :
-- all | regulars (3+ visites) | recent (venu < 30 j) | dormant (pas venu > 60 j).
-- Les compteurs sont figés à l'envoi.
-- =====================================================

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  name text not null,
  channel text not null check (channel in ('email', 'whatsapp')),
  segment text not null check (segment in ('all', 'regulars', 'recent', 'dormant')),
  -- Sujet requis pour l'email, ignoré pour WhatsApp.
  subject text,
  body text not null,

  status text not null default 'draft' check (status in ('draft', 'sent')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  sent_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists campaigns_tenant_idx on campaigns(tenant_id);

alter table campaigns enable row level security;
