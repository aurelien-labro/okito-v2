-- =====================================================
-- OKITO V2 — Migration 0017
-- Portail self-service client : /r/:token
--
-- Le token brut (randomBytes(32).hex) n'est JAMAIS stocké — seule son
-- empreinte SHA-256 l'est. Le token circule dans l'URL envoyée au client ;
-- une fuite de la DB ne permet pas de forger des liens portail.
--
-- Les réservations antérieures ont un hash null → pas de lien portail
-- (pas de backfill possible : le token brut n'existe plus).
-- =====================================================

alter table reservations
  add column if not exists access_token_hash text;

create unique index if not exists reservations_access_token_hash_uniq
  on reservations (access_token_hash)
  where access_token_hash is not null;
