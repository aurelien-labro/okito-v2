-- =====================================================
-- OKITO V2 — Migration 0015
-- Membre assigné à une réservation (polyvalence multi-vertical).
--
-- Le "qui s'en occupe" : coiffeur pour la coupe, mécanicien pour le pont,
-- praticien pour la consultation. Nullable — les verticaux sans staff
-- nominatif (resto simple) continuent sans.
-- =====================================================

alter table reservations
  add column if not exists assigned_member_id uuid references tenant_members(id) on delete set null;

create index if not exists reservations_assignee_idx
  on reservations (assigned_member_id, date_reservation)
  where status = 'confirmed' and assigned_member_id is not null;
