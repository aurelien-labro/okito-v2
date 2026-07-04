-- =====================================================
-- OKITO V2 — Migration 0022
-- Boîtes email connectées par tenant (ingestion Gmail, fondation V3).
--
-- Une ligne = une boîte Gmail reliée en OAuth (refresh_token pour renouveler
-- l'access_token, history_id comme curseur de sync incrémentale).
-- Les tokens ne sortent jamais par l'API admin.
-- =====================================================

create table if not exists tenant_mailboxes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null default 'gmail',
  email_address text not null,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  history_id text,
  last_sync_at timestamptz,
  last_error text,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists tenant_mailboxes_tenant_idx
  on tenant_mailboxes (tenant_id);
