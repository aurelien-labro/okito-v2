-- =====================================================
-- OKITO V2 — Migration 0006
-- Table subscriptions : suivi des abonnements Stripe par tenant.
--
-- Source de vérité = Stripe. Cette table est un cache local mis à
-- jour via webhook customer.subscription.{created, updated, deleted}.
-- Permet d'afficher le statut dans le dashboard sans appeler Stripe
-- à chaque requête + de verrouiller des features quand status != active.
-- =====================================================

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,

  -- Plan tarifaire (price ID Stripe). Le label vertical (basic_restaurant,
  -- pro_hotel, etc.) est résolu côté code via STRIPE_PRICE_IDS_BY_VERTICAL.
  stripe_price_id text not null,

  -- active / trialing / past_due / canceled / unpaid / incomplete
  status text not null,

  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, stripe_subscription_id)
);

create index if not exists subscriptions_tenant_idx on subscriptions (tenant_id);
create index if not exists subscriptions_status_idx on subscriptions (status);
