-- =====================================================
-- OKITO V3 — Migration 0031
-- Boutiques Shopify du commerce : ingestion des commandes e-commerce dans le
-- journal de Jarvis (CA en ligne, TVA collectée, clients).
--
-- Une ligne = une boutique reliée par jeton Admin API (custom app), chiffré au
-- repos (AES-256-GCM via MAILBOX_ENC_KEY, jamais exposé par l'API).
-- `order_cursor` = date de création de la dernière commande ingérée
-- (bootstrap à la connexion : on n'ingère que les commandes APRÈS).
-- =====================================================

create table if not exists tenant_shopify_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- Domaine myshopify de la boutique (ex: ma-boutique.myshopify.com) et
  -- libellé d'affichage (nom de la boutique renvoyé par /shop.json).
  shop_domain text not null,
  shop_label text not null default 'Boutique Shopify',
  -- Jeton Admin API (shpat_…), chiffré (jamais en clair, jamais exposé).
  access_token_enc text not null,

  -- Curseur de sync : created_at de la dernière commande ingérée.
  order_cursor timestamptz,
  last_sync_at timestamptz,
  last_error text,

  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  created_at timestamptz not null default now(),

  unique (tenant_id, shop_domain)
);

create index if not exists tenant_shopify_connections_tenant_idx
  on tenant_shopify_connections(tenant_id);

alter table tenant_shopify_connections enable row level security;
