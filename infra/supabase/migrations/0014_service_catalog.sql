-- =====================================================
-- OKITO V2 — Migration 0014
-- Catalogue de prestations par tenant (polyvalence multi-vertical).
--
-- Un "service" = une prestation vendable à créneau : coupe homme (30 min),
-- vidange (60 min), consultation (20 min), nuit en suite (1440 min)…
-- Le vocabulaire s'adapte au vertical, le moteur ne change pas.
--
--   tenant_service_catalog : prestations proposées, avec durée et prix.
--   reservations.service_id : prestation choisie (nullable — les verticaux
--     sans catalogue, ex. resto, continuent sans).
--   reservations.duration_minutes : snapshot de la durée au moment de la
--     résa (immune aux changements ultérieurs du catalogue).
--
--   custom_fields : attributs métier libres définis par le tenant
--   (ex. garage : { "vehicule_requis": true } ; spa : { "cabine": "double" }).
-- =====================================================

create table if not exists tenant_service_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 60 check (duration_minutes >= 5 and duration_minutes <= 10080),
  price_cents integer check (price_cents >= 0),
  currency text not null default 'EUR',
  active boolean not null default true,
  display_order integer not null default 0,
  custom_fields jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists tenant_service_catalog_tenant_idx
  on tenant_service_catalog (tenant_id, display_order)
  where active = true;

alter table reservations
  add column if not exists service_id uuid references tenant_service_catalog(id) on delete set null;

alter table reservations
  add column if not exists duration_minutes integer check (duration_minutes is null or duration_minutes >= 5);
