-- =====================================================
-- OKITO V3 — Migration 0039
-- Marketplace de connecteurs tiers signés (vague 5, chantier 4) :
-- un connecteur = un manifest JSON signé Ed25519 par un éditeur de
-- confiance. À l'installation, signature vérifiée puis secret HMAC
-- partagé généré — chaque exécution Jarvis (`ext.<connectorId>`) est
-- POSTée sur l'endpoint du connecteur, signée avec ce secret.
-- =====================================================

create table if not exists tenant_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  connector_id text not null,
  name text not null,
  publisher text not null,
  version text not null,
  endpoint text not null,
  -- Manifest complet tel que signé (source de vérité pour l'affichage).
  manifest jsonb not null,
  -- Secret HMAC partagé avec le connecteur, généré à l'installation.
  shared_secret text not null,
  enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, connector_id)
);

create index if not exists tenant_connectors_tenant_idx on tenant_connectors(tenant_id);

alter table tenant_connectors enable row level security;
