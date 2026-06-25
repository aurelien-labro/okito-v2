# Supabase — Infrastructure

## Migrations

Source de vérité du schéma. Toute évolution passe par une nouvelle migration `000N_*.sql` ici.

| Fichier | Statut | Appliquée en prod |
|---|---|---|
| `migrations/0001_initial.sql` | Snapshot du schéma initial (4 tables + RLS + fonctions) | ✅ 2026-06-22 |

## Comment ajouter une migration

```bash
# Option A — Générer depuis le code Drizzle (DDL pur)
pnpm --filter @okito/db migrate:gen

# Option B — Migration SQL manuelle (RLS, fonctions, triggers, données)
# Créer infra/supabase/migrations/0002_<description>.sql
# Puis appliquer via le SQL editor Supabase OU psql avec DATABASE_URL
```

## Seed de dev

Pas de seed automatique. Voir `scripts/seed-dev.ts` à la racine du repo.

```bash
pnpm tsx scripts/seed-dev.ts
```

Crée le tenant `okito` + quelques réservations de test.
