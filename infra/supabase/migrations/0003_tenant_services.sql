-- =====================================================
-- OKITO V2 — Migration 0003
-- Ajout d'une colonne services (JSONB) sur tenants pour permettre
-- de définir des plages d'ouverture libres (label + start + end).
--
-- Compat : si services est vide ([]), le code fallback sur les 4
-- colonnes legacy service_lunch_start/end + service_dinner_start/end.
-- Aucune donnée existante touchée.
-- =====================================================

alter table tenants
  add column if not exists services jsonb not null default '[]'::jsonb;

-- Sanity check léger : la valeur doit être un tableau JSON.
alter table tenants
  add constraint tenants_services_is_array
    check (jsonb_typeof(services) = 'array');
