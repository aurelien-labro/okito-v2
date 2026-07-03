-- =====================================================
-- OKITO V2 — Migration 0020
-- Event bus : journal append-only de tous les événements métier.
--
-- Fondation V3 "Jarvis" : chaque module publie ses événements ici au lieu
-- d'appeler ses voisins. C'est la source unique que l'agent requête pour
-- son contexte, son brief matinal et la timeline client 360°.
--
--   type    : "<entity>.<verb>" (ex: "reservation.created"), même convention
--             que audit_log et tenant_webhooks.
--   source  : émetteur ("api", "inngest", "jarvis"…).
--   payload : snapshot JSONB de l'entité au moment de l'événement.
--
-- Append-only : jamais d'UPDATE/DELETE applicatif sur cette table.
-- =====================================================

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,
  source text not null default 'api',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists events_tenant_created_idx
  on events (tenant_id, created_at);

create index if not exists events_type_created_idx
  on events (type, created_at);
