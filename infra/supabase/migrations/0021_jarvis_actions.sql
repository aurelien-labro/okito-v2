-- =====================================================
-- OKITO V2 — Migration 0021
-- Actions Jarvis avec garde-fous (fondation V3).
--
-- Chaque action proposée par l'agent passe par un cycle de vie gouverné
-- par une politique par type d'action :
--   auto             : exécutable immédiatement
--   auto_cancellable : exécutable, annulable jusqu'à cancellable_until
--   approval         : bloquée tant que le patron ne valide pas
--
-- Statuts : awaiting_approval | scheduled | executed | cancelled | failed
-- Alimente le panneau "Jarvis a agi pour toi" du dashboard.
-- =====================================================

create table if not exists jarvis_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,
  summary text not null,
  policy text not null check (policy in ('auto', 'auto_cancellable', 'approval')),
  status text not null check (
    status in ('awaiting_approval', 'scheduled', 'executed', 'cancelled', 'failed')
  ),
  payload jsonb not null default '{}',
  result jsonb,
  cancellable_until timestamptz,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists jarvis_actions_tenant_created_idx
  on jarvis_actions (tenant_id, created_at);

create index if not exists jarvis_actions_tenant_status_idx
  on jarvis_actions (tenant_id, status);
