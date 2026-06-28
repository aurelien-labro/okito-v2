-- =====================================================
-- OKITO V2 — Migration 0013
-- Inventaire de tables par tenant (capacité plus réaliste qu'un plafond global).
--
-- Modèle :
--   tenant_tables : id, tenant_id, label ("T1"), capacity (2/4/6), active.
--   reservations.table_id (nullable) : assignation à une table si table mode actif.
--
-- Mode :
--   - 0 table active pour un tenant → mode legacy (capacity_max global).
--   - >0 tables actives           → mode table : check_availability cherche
--     la plus petite table libre où capacity >= party_size.
-- =====================================================

create table if not exists tenant_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  label text not null,
  capacity integer not null check (capacity >= 1 and capacity <= 30),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, label)
);

create index if not exists tenant_tables_tenant_idx
  on tenant_tables (tenant_id)
  where active = true;

alter table reservations
  add column if not exists table_id uuid references tenant_tables(id) on delete set null;

create index if not exists reservations_table_slot_idx
  on reservations (table_id, date_reservation, heure)
  where status = 'confirmed' and table_id is not null;
