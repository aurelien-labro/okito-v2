-- =====================================================
-- OKITO V3 — Migration 0032
-- Boutiques WooCommerce du commerce : ingestion des commandes e-commerce dans
-- le journal de Jarvis (CA en ligne, TVA collectée), pendant WordPress de la
-- connexion Shopify (0031).
--
-- Une ligne = une boutique reliée par clés REST API WooCommerce (consumer
-- key + consumer secret), stockées chiffrées ensemble (AES-256-GCM via
-- MAILBOX_ENC_KEY, jamais exposées par l'API). `order_cursor` = date de
-- création de la dernière commande ingérée.
-- =====================================================

create table if not exists tenant_woocommerce_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- URL racine de la boutique (https://boutique.fr) et libellé d'affichage.
  store_url text not null,
  store_label text not null default 'Boutique WooCommerce',
  -- Clés REST API (consumer key + secret) chiffrées ensemble en JSON.
  credentials_enc text not null,

  -- Curseur de sync : date de création de la dernière commande ingérée.
  order_cursor timestamptz,
  last_sync_at timestamptz,
  last_error text,

  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  created_at timestamptz not null default now(),

  unique (tenant_id, store_url)
);

create index if not exists tenant_woocommerce_connections_tenant_idx
  on tenant_woocommerce_connections(tenant_id);

alter table tenant_woocommerce_connections enable row level security;
