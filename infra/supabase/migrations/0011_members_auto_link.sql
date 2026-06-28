-- =====================================================
-- OKITO V2 — Migration 0011
-- Auto-link des invitations tenant_members quand l'invité signup
-- Supabase Auth avec son email.
--
-- Flow :
--   1. Owner POST /v1/admin/members/:tenantId/invite { email, role }
--      → insert { invited_email: 'pierre@x.fr', invited_at: now(), user_id: null }
--   2. Pierre signup Supabase Auth avec pierre@x.fr
--   3. Trigger ci-dessous se déclenche sur INSERT auth.users :
--      → cherche les rows tenant_members où invited_email = NEW.email AND user_id IS NULL
--      → set user_id = NEW.id, accepted_at = now()
--
-- Le trigger touche auth.users (schema Supabase) — nécessite que la
-- migration soit appliquée par un user avec droits suffisants
-- (postgres role qui possède la fonction).
-- =====================================================

create or replace function public.link_tenant_invitations_to_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Match toutes les invitations pendantes pour cet email
  update public.tenant_members
  set
    user_id = new.id::text,
    accepted_at = now()
  where invited_email = lower(new.email)
    and user_id is null;

  return new;
end;
$$;

-- Drop d'abord pour idempotence (réapplication safe en dev).
drop trigger if exists on_auth_user_created_link_members on auth.users;

create trigger on_auth_user_created_link_members
  after insert on auth.users
  for each row execute function public.link_tenant_invitations_to_new_user();

-- Backfill : link les invitations existantes pour les users déjà signed up.
update public.tenant_members tm
set
  user_id = au.id::text,
  accepted_at = coalesce(tm.accepted_at, now())
from auth.users au
where tm.user_id is null
  and tm.invited_email is not null
  and lower(au.email) = tm.invited_email;
