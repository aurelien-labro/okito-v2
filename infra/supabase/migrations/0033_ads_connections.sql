-- =====================================================
-- OKITO V3 — Migration 0033
-- Comptes publicitaires du commerce : Google Ads et Meta Ads (Facebook &
-- Instagram), reliés en OAuth. v1 = connexion + gestion (pause, déconnexion) ;
-- l'ingestion des dépenses/conversions viendra dans sa propre itération
-- (elle exige un developer token Google Ads approuvé).
--
-- Même pattern que tenant_calendars (0030) : tokens en colonnes dédiées,
-- jamais exposés par l'API admin.
-- =====================================================

create table if not exists tenant_google_ads_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  account_label text not null default 'Google Ads',

  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,

  last_sync_at timestamptz,
  last_error text,

  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists tenant_google_ads_connections_tenant_idx
  on tenant_google_ads_connections(tenant_id);

alter table tenant_google_ads_connections enable row level security;

-- Meta : pas de refresh token — un token long-lived (~60 j) renouvelé à la
-- reconnexion. `external_account_id` = id du compte Meta connecté.
create table if not exists tenant_meta_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  external_account_id text not null,
  account_label text not null default 'Meta Ads',

  access_token text not null,
  access_token_expires_at timestamptz not null,

  last_sync_at timestamptz,
  last_error text,

  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  created_at timestamptz not null default now(),

  unique (tenant_id, external_account_id)
);

create index if not exists tenant_meta_connections_tenant_idx
  on tenant_meta_connections(tenant_id);

alter table tenant_meta_connections enable row level security;
