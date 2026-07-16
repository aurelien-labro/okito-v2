---
name: okito-migration
description: Ajouter et appliquer une migration Drizzle OKITO sur Supabase prod avec le garde-fou d'autorisation explicite. Utiliser dès qu'un changement de schéma DB est nécessaire.
---

# Migrations OKITO

## Où
- Fichiers : `infra/supabase/migrations/00XX_<nom>.sql`
- Schéma Drizzle miroir : `packages/db/src/schema/*.ts`
- Numérotation : prochain entier libre (dernière appliquée = 0030 au 2026-07-06 ; prochaine = **0031**).

## Créer une migration
1. Ajouter le fichier SQL `infra/supabase/migrations/00XX_<snake_case>.sql`.
2. Miroir Drizzle dans `packages/db/src/schema/`.
3. Ajouter les policies **RLS** si nouvelle table multi-tenant (`tenant_id` obligatoire, policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)`).
4. `pnpm -w typecheck` — Drizzle doit compiler.
5. Tests : si la table est utilisée par un service, ajouter un test pglite qui crée + lit une ligne.

## Invariants
- **Multi-tenant strict** : toute nouvelle table métier a `tenant_id uuid not null references tenants(id) on delete cascade` + RLS activé.
- **Idempotency** : ajouter les contraintes uniques métier dans la même migration (ex: `unique(tenant_id, external_id)`).
- **Jamais** de `DROP TABLE` / `DROP COLUMN` sans autorisation explicite d'Aurélien — Supabase prod contient de la vraie donnée.

## Appliquer sur Supabase prod
**Garde-fou dur : ne JAMAIS appliquer une migration en prod sans autorisation explicite d'Aurélien dans la conversation en cours.** Une autorisation antérieure ne compte pas.

Quand autorisé :
1. Confirmer à voix haute : « J'applique 00XX sur Supabase prod. »
2. Lancer via le CLI Supabase ou la page SQL editor selon ce qu'Aurélien préfère.
3. Vérifier : `select * from supabase_migrations.schema_migrations order by version desc limit 5;`
4. Mettre à jour la mémoire projet ([[project-okito-v3-jarvis]]) : migration 00XX appliquée le YYYY-MM-DD.

## Ordre PR ↔ migration
- La migration est listée dans la section « À faire au merge » de la PR.
- Elle est appliquée **après** merge, pas avant (sinon la prod diverge du code déployé).
