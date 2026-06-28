-- =====================================================
-- OKITO V2 — Migration 0010
-- Table tenant_members : qui peut accéder à quel tenant, avec quel rôle.
--
-- Rôles V0 :
--   owner   — tous droits. Peut inviter / retirer des membres, changer
--             toute la config, voir les stats, créer/annuler des résa.
--   manager — config tenant + stats + résa, mais ne peut pas gérer
--             les membres ni suspendre le tenant.
--   staff   — voir + créer + annuler des résa uniquement.
--
-- Invitation par email : on insère un row avec invited_email + invited_at
-- (sans user_id encore). Quand l'utilisateur signup avec cet email,
-- un trigger côté Supabase Auth (à coder en PR follow-up) match l'email
-- et set user_id + accepted_at.
-- =====================================================

create table if not exists tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- user_id Supabase Auth (sub) — null tant que l'invitation n'est pas acceptée
  user_id text,
  invited_email text,

  role text not null check (role in ('owner', 'manager', 'staff')),

  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),

  -- Un user ne peut avoir qu'un seul role par tenant
  unique (tenant_id, user_id),
  -- Un email ne peut être invité qu'une seule fois par tenant en pending
  unique (tenant_id, invited_email)
);

create index if not exists tenant_members_user_idx on tenant_members (user_id) where user_id is not null;
create index if not exists tenant_members_tenant_idx on tenant_members (tenant_id);
