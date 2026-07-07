-- =====================================================
-- OKITO V3 — Migration 0027
-- Connexions Google Business Profile : ingestion des avis Google
-- + réponse autonome Jarvis (boucle 4).
--
-- Une ligne = une fiche Google (location) reliée en OAuth pour un tenant.
-- Les tokens ne sortent jamais par l'API (SafeConnection côté service).
-- review_cursor = updateTime du dernier avis ingéré (bootstrap à la
-- connexion : on n'ingère que les avis reçus APRÈS).
-- =====================================================

create table if not exists tenant_google_business (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- Ressources Google : accounts/{id} et locations/{id}
  account_name text not null,
  location_name text not null,
  -- Nom d'affichage de la fiche (ex : "Boulangerie du Parc")
  location_title text not null,

  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,

  -- Curseur de sync : updateTime du dernier avis traité
  review_cursor timestamptz,
  last_sync_at timestamptz,
  last_error text,

  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists tenant_google_business_tenant_idx
  on tenant_google_business(tenant_id);

-- Une même fiche Google ne peut être connectée qu'une fois par tenant.
create unique index if not exists tenant_google_business_location_uniq
  on tenant_google_business(tenant_id, location_name);

alter table tenant_google_business enable row level security;
