-- =====================================================
-- OKITO V2 — Migration 0019
-- Avis clients post-visite.
--
-- Après une prestation honorée, OKITO envoie un lien d'avis (réutilise le
-- token portail). Le client note 1-5 + commentaire optionnel. Un seul avis
-- par réservation (unicité).
-- =====================================================

create table if not exists reservation_reviews (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  submitted_at timestamptz not null default now(),
  unique (reservation_id)
);

create index if not exists reservation_reviews_tenant_idx
  on reservation_reviews (tenant_id, submitted_at desc);
