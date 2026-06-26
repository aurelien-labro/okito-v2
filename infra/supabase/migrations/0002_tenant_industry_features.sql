-- =====================================================
-- OKITO V2 — Migration 0002
-- Ajout industry + features sur tenants pour permettre
-- de servir plusieurs verticaux (resto, hôtel, garage, etc.)
-- depuis le même code avec un IndustryProfile + feature flags.
-- =====================================================

-- 1. industry : enum stocké en text (validation côté app).
alter table tenants
  add column if not exists industry text not null default 'restaurant';

alter table tenants
  add constraint tenants_industry_check
    check (industry in ('restaurant', 'hotel', 'garage', 'beauty', 'realestate', 'rental', 'generic'));

-- 2. features : JSONB de flags par tenant, override des défauts du profile industry.
alter table tenants
  add column if not exists features jsonb not null default '{
    "voice": true,
    "reminders": true,
    "deposits": false,
    "waitlist": false,
    "loyalty": false,
    "multi_resource": false
  }'::jsonb;

-- 3. Backfill : tous les tenants existants (= OKITO) sont des restaurants avec voice + reminders.
update tenants
set industry = 'restaurant'
where industry is null or industry = '';
