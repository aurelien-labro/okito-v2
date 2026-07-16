-- =====================================================
-- OKITO V3 — Migration 0036
-- Site builder (vague 3) : site vitrine hébergé par tenant.
--
-- V1 : un site mono-page par tenant, composé de blocs configurables
-- (hero, offre, infos pratiques, avis, contact/résa) stockés en jsonb.
-- Le rendu public est servi par slug (okito.app/s/[slug]) ; le widget de
-- réservation et le tracker analytics y sont injectés automatiquement.
-- =====================================================

create table if not exists tenant_sites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- Slug public du site (okito.app/s/[slug]) — indépendant du slug interne du tenant.
  slug text not null,
  theme text not null default 'okito',
  -- Blocs de la page : { hero: {...}, offer: {...}, info: {...}, reviews: {...}, contact: {...} }
  blocks jsonb not null default '{}',
  -- SEO : { title, description }
  seo jsonb not null default '{}',

  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id),
  unique (slug)
);

alter table tenant_sites enable row level security;
