# Row-Level Security — OKITO V2

Activée par la migration `0005_rls_policies.sql`.

## Tables protégées

| Table | Politique |
|---|---|
| `tenants` | `service_role` : ALL ; `authenticated` : SELECT du tenant correspondant à `jwt.tenant_id` |
| `reservations` | `service_role` : ALL ; `authenticated` : ALL du tenant correspondant |
| `conversations` | `service_role` : ALL ; `authenticated` : ALL du tenant correspondant |
| `tenant_phone_routes` | `service_role` : ALL ; `authenticated` : ALL du tenant correspondant |
| `audit_log` | `service_role` UNIQUEMENT — pas d'accès direct depuis un utilisateur authentifié |

## Comportement actuel (post-migration)

L'API Hono (`apps/api`) parle à Postgres via `DATABASE_URL` avec le role **`postgres`** (superuser). Les superusers **bypass RLS automatiquement** — donc **aucun changement de comportement** pour le code applicatif existant.

La migration est defense-in-depth : si demain on expose la DB directement (Supabase client JS dans le dashboard, API publique avec clé anon, etc.), l'isolation tenant tient déjà sans refacto.

## Activer RLS pour l'API (futur)

Si on veut un jour faire respecter RLS à l'API aussi (par exemple parce qu'on craint un bug de filtrage en code) :

1. Changer `DATABASE_URL` pour utiliser un role non-superuser (par ex. un user `okito_api` créé avec `noinherit nobypassrls`)
2. Au début de chaque requête HTTP, exécuter dans la transaction :
   ```sql
   SELECT set_config('request.jwt.claims', '{"tenant_id":"<uuid>"}', true);
   ```
3. Tester en CI avec Testcontainers Postgres (PR à venir).

## Vérifier que RLS est bien actif

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'tenants', 'reservations', 'conversations',
    'tenant_phone_routes', 'audit_log'
  );
```

Toutes les lignes doivent montrer `rowsecurity = true`.

## Lister les policies actives

```sql
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Tester l'isolation depuis Supabase Studio

1. Studio → SQL Editor
2. `set role authenticated;`
3. `select * from tenants;` → doit retourner 0 ligne (pas de JWT)
4. `reset role;` → retour superuser
5. `select * from tenants;` → retourne tout
