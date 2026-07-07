-- =====================================================
-- OKITO V3 — Migration 0028
-- Comptes Stripe du commerce : ingestion des encaissements réels.
--
-- Une ligne = un compte Stripe relié par clé secrète restreinte (lecture
-- seule), chiffrée au repos (AES-256-GCM via MAILBOX_ENC_KEY, jamais
-- exposée par l'API). `charge_cursor` = date du dernier paiement ingéré
-- (bootstrap à la connexion : on n'ingère que les paiements APRÈS).
-- =====================================================

create table if not exists tenant_stripe_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- Libellé d'affichage (v1 : "Stripe" ou l'account_id découvert).
  account_label text not null default 'Stripe',
  -- Clé secrète restreinte, chiffrée (jamais en clair, jamais exposée).
  secret_key_enc text not null,

  -- Curseur : created du dernier charge ingéré.
  charge_cursor timestamptz,
  last_sync_at timestamptz,
  last_error text,

  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists tenant_stripe_accounts_tenant_idx
  on tenant_stripe_accounts(tenant_id);

alter table tenant_stripe_accounts enable row level security;
