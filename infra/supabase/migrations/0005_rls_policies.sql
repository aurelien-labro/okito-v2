-- =====================================================
-- OKITO V2 — Migration 0005
-- Active RLS (Row-Level Security) sur les tables multi-tenant.
--
-- Modèle :
-- - L'API Hono parle à Postgres via DATABASE_URL avec le role `postgres`
--   (superuser, bypass RLS automatique). Aucun changement de comportement
--   pour le code applicatif existant.
-- - Pour tout autre accès (Supabase client JS côté navigateur, futur accès
--   direct par un tiers via clé anon, etc.) : isolation stricte par tenant_id
--   extrait du JWT Supabase.
-- - Service role (clé secrète Supabase) bypass complet — utile pour les
--   migrations et les jobs cron qui doivent voir tous les tenants.
--
-- Cette migration est defense-in-depth. Si demain on expose la DB
-- directement au dashboard pour économiser les hops API, la sécurité
-- multi-tenant tient déjà.
--
-- Réf : https://supabase.com/docs/guides/auth/row-level-security
-- =====================================================

-- =====================================================
-- TENANTS
-- =====================================================
alter table tenants enable row level security;

create policy "tenants_service_role_all" on tenants
  for all
  to service_role
  using (true)
  with check (true);

-- Un utilisateur authentifié ne peut voir que son propre tenant
-- (extrait du claim `tenant_id` du JWT Supabase).
create policy "tenants_self_select" on tenants
  for select
  to authenticated
  using (id = (auth.jwt() ->> 'tenant_id')::uuid);

-- =====================================================
-- RESERVATIONS
-- =====================================================
alter table reservations enable row level security;

create policy "reservations_service_role_all" on reservations
  for all
  to service_role
  using (true)
  with check (true);

create policy "reservations_tenant_isolation" on reservations
  for all
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- =====================================================
-- CONVERSATIONS
-- =====================================================
alter table conversations enable row level security;

create policy "conversations_service_role_all" on conversations
  for all
  to service_role
  using (true)
  with check (true);

create policy "conversations_tenant_isolation" on conversations
  for all
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- =====================================================
-- TENANT_PHONE_ROUTES
-- =====================================================
alter table tenant_phone_routes enable row level security;

create policy "tenant_phone_routes_service_role_all" on tenant_phone_routes
  for all
  to service_role
  using (true)
  with check (true);

create policy "tenant_phone_routes_tenant_isolation" on tenant_phone_routes
  for all
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- =====================================================
-- AUDIT_LOG
-- =====================================================
-- Le journal d'audit est admin-only : un tenant standard ne doit jamais
-- lire ses propres logs (et encore moins ceux des autres). Seul le
-- service_role peut y accéder.
alter table audit_log enable row level security;

create policy "audit_log_service_role_only" on audit_log
  for all
  to service_role
  using (true)
  with check (true);
