-- =====================================================
-- OKITO V2 — Migration 0008
-- Acomptes anti-no-show.
--
-- Modèle :
-- - tenants.deposit_amount_cents : montant en centimes EUR (0 = désactivé)
-- - tenants.deposit_required_above_party : seuil de couverts à partir duquel
--   l'acompte est demandé (0 = jamais, 6 = à partir de 6 personnes)
-- - tenants.deposit_currency : ISO 4217 (défaut "EUR")
-- - reservations.deposit_status : 'none' | 'required' | 'pending' | 'paid'
--   | 'refunded' | 'failed'
-- - reservations.deposit_payment_intent_id : Stripe Payment Intent ID (nullable)
-- - reservations.deposit_amount_cents : montant exact retenu à la création
--   (snapshot du tenant à ce moment-là, pour ne pas être affecté par les
--   futurs changements de prix)
-- =====================================================

alter table tenants
  add column if not exists deposit_amount_cents integer not null default 0
    check (deposit_amount_cents >= 0 and deposit_amount_cents <= 100000),
  add column if not exists deposit_required_above_party integer not null default 0
    check (deposit_required_above_party >= 0 and deposit_required_above_party <= 50),
  add column if not exists deposit_currency text not null default 'EUR'
    check (deposit_currency in ('EUR', 'USD', 'GBP', 'CHF'));

alter table reservations
  add column if not exists deposit_status text not null default 'none'
    check (deposit_status in ('none', 'required', 'pending', 'paid', 'refunded', 'failed')),
  add column if not exists deposit_amount_cents integer,
  add column if not exists deposit_payment_intent_id text;

create index if not exists reservations_deposit_status_idx
  on reservations (tenant_id, deposit_status)
  where deposit_status in ('required', 'pending');
