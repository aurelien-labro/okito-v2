-- =====================================================
-- OKITO V3 — Migration 0034
-- Multi-établissements : un tenant peut appartenir à un « groupe » (lui-même
-- un tenant). Chaque établissement reste un tenant complet et isolé ; le
-- groupe ne sert qu'au rattachement et à l'héritage d'accès :
-- un OWNER du groupe accède à tous les établissements enfants, les autres
-- rôles restent cloisonnés à leur établissement.
-- =====================================================

alter table tenants
  add column if not exists parent_tenant_id uuid references tenants(id) on delete set null;

create index if not exists tenants_parent_idx on tenants(parent_tenant_id);
