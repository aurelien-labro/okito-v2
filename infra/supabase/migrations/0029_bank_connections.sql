-- =====================================================
-- OKITO V3 — Migration 0029
-- Connexions bancaires du commerce : ingestion des transactions pour le
-- rapprochement (fiabiliser la TVA : facture marquée payée vs encaissement réel).
--
-- Une ligne = un accès à un agrégateur bancaire (Bridge / Powens) relié par
-- jeton d'accès, chiffré au repos (AES-256-GCM via MAILBOX_ENC_KEY, jamais
-- exposé par l'API). `transaction_cursor` = date de la dernière transaction
-- ingérée (bootstrap à la connexion : on n'ingère que les mouvements APRÈS).
-- =====================================================

create table if not exists tenant_bank_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- Agrégateur utilisé (bridge, powens…) et libellé d'affichage.
  provider text not null default 'bridge',
  account_label text not null default 'Banque',
  -- Jeton d'accès à l'agrégateur, chiffré (jamais en clair, jamais exposé).
  access_token_enc text not null,

  -- Curseur : date de la dernière transaction ingérée.
  transaction_cursor timestamptz,
  last_sync_at timestamptz,
  last_error text,

  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists tenant_bank_connections_tenant_idx
  on tenant_bank_connections(tenant_id);

alter table tenant_bank_connections enable row level security;
