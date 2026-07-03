-- =====================================================
-- OKITO V2 — Migration 0016
-- Règles d'ouverture récurrentes par tenant.
--
-- Trois genres :
--   weekly_closed : { "weekdays": [0, 1] }         (0=dimanche, 1=lundi…)
--   date_closed   : { "date": "2026-12-25" }
--                   ou { "from": "2026-08-01", "to": "2026-08-15" }
--   date_special  : { "date": "2026-05-01",
--                     "services": [{ "label": "Férié", "start": "10:00", "end": "16:00" }] }
--
-- Priorité : date_special > date_closed / weekly_closed > horaires normaux.
-- =====================================================

create table if not exists tenant_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null check (kind in ('weekly_closed', 'date_closed', 'date_special')),
  payload jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists tenant_schedule_rules_tenant_idx
  on tenant_schedule_rules (tenant_id)
  where active = true;
