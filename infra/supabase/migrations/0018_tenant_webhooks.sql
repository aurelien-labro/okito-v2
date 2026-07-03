-- =====================================================
-- OKITO V2 — Migration 0018
-- Webhooks sortants par tenant : intégrations (Zapier, Make, ERP maison…).
--
-- À chaque événement (résa créée/annulée/no-show, waitlist), OKITO POST le
-- payload signé HMAC-SHA256 aux URLs abonnées. Fire-and-forget avec retry.
--
--   events : liste des types abonnés. Vide → tous les événements.
--   secret : sert à signer le header X-Okito-Signature (le tenant vérifie).
-- =====================================================

create table if not exists tenant_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  url text not null,
  secret text not null,
  events text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists tenant_webhooks_tenant_idx
  on tenant_webhooks (tenant_id)
  where active = true;
