-- =====================================================
-- OKITO V2 — Migration 0026
-- Taux de TVA par facture (préparation de la déclaration, vague 3).
--
-- Un taux par facture (en basis points : 2000 = 20%, 1000 = 10%,
-- 550 = 5,5%, 0 = exonéré). Les montants stockés restent TTC ; le HT et
-- la TVA sont dérivés au moment du rapport. Défaut 20% (taux normal FR),
-- modifiable à la création.
-- =====================================================

alter table invoices
  add column if not exists vat_rate_bps integer not null default 2000;
alter table supplier_invoices
  add column if not exists vat_rate_bps integer not null default 2000;
