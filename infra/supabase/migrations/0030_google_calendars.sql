-- =====================================================
-- OKITO V3 — Migration 0030
-- Agendas Google connectés : import des créneaux occupés pour éviter les
-- doubles réservations (sens Google → OKITO ; l'export OKITO → Google viendra).
--
-- Une ligne = un agenda Google relié en OAuth pour un tenant. Les tokens ne
-- sortent jamais par l'API. `events_cursor` = updated du dernier event
-- importé (bootstrap à la connexion : on n'importe que les créneaux APRÈS).
-- =====================================================

create table if not exists tenant_calendars (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- Ressource agenda Google (ex : "primary" ou l'adresse de l'agenda).
  calendar_id text not null,
  -- Nom d'affichage de l'agenda.
  calendar_summary text not null,

  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,

  -- Curseur de sync : updated du dernier event importé.
  events_cursor timestamptz,
  last_sync_at timestamptz,
  last_error text,

  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists tenant_calendars_tenant_idx
  on tenant_calendars(tenant_id);

-- Un même agenda Google ne peut être connecté qu'une fois par tenant.
create unique index if not exists tenant_calendars_calendar_uniq
  on tenant_calendars(tenant_id, calendar_id);

alter table tenant_calendars enable row level security;
