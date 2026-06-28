-- =====================================================
-- OKITO V2 — Migration 0004
-- Table audit_log : trace toutes les actions admin
-- (création/modification/suspension/activation tenants,
-- futurs changements de prix, reset password, etc.)
--
-- before/after stockent l'état avant/après en JSONB pour
-- pouvoir reconstituer une modification sans rejouer les
-- diffs.
-- =====================================================

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),

  -- tenant_id peut être null pour les actions cross-tenant
  -- (création d'un tenant = pas encore d'id avant l'insert)
  tenant_id uuid references tenants(id) on delete set null,

  actor_user_id text,
  actor_label text,

  -- action : "tenant.create", "tenant.update", "tenant.suspend",
  --         "tenant.activate", "reservation.update", "reservation.cancel"
  action text not null,

  entity_type text not null,
  entity_id text,

  before jsonb,
  after jsonb,

  ip text,
  user_agent text,

  created_at timestamptz not null default now()
);

create index if not exists audit_log_tenant_created_idx
  on audit_log (tenant_id, created_at desc);

create index if not exists audit_log_entity_idx
  on audit_log (entity_type, entity_id);

create index if not exists audit_log_actor_idx
  on audit_log (actor_user_id, created_at desc);
