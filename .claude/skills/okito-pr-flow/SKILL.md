---
name: okito-pr-flow
description: Recette PR OKITO — branche feat/fix, typecheck + Biome + tests avant push, PR body avec migrations/env, squash+delete. Utiliser dès qu'une modif OKITO va être poussée sur GitHub.
---

# Flow PR OKITO (V2 et V3)

## Règles dures
- **Une feature = une branche + une PR**. Conventional Commits : `feat:`, `fix:`, `chore:`, `refactor:`.
- **Jamais push sur `main`** directement.
- **Ne jamais merger sa propre PR** — Aurélien merge. Claude prépare, Aurélien clique.
- **Ne jamais `--no-verify`** — les hooks Biome/pre-commit sont là pour une raison.

## Séquence obligatoire avant `git push`
Depuis `apps/api` ou la racine :
1. `pnpm -w typecheck` → **0 erreur**
2. `pnpm -w lint` (Biome) → 0 erreur (autofix peut refactorer au vol, re-vérifier le diff après)
3. `pnpm -w test` → 100% vert
4. `git status` — vérifier qu'aucun fichier sensible (`.env`, secret, dump) n'est stagé

Si un de ces steps casse, **fixer avant de push**. Ne pas contourner.

## PR body — template minimum
```
## Quoi
<1-3 puces : le changement métier, pas la ligne de code>

## Tests
- [x] typecheck
- [x] biome
- [x] vitest (N tests)
- [ ] test manuel : <étape reproductible>

## À faire au merge
- [ ] Migration 00XX à appliquer sur Supabase prod
- [ ] Env `FOO_BAR` à poser dans apps/api/.env prod
- [ ] Rien
```

## Après merge
- Squash + delete branch (option GitHub).
- Si migration : voir skill [okito-migration].
- Si nouvelle env : la lister dans le PROJECT.md du jour.

## Gotcha récurrent
Résolution auto de conflit « keep both sides » sur des blocs `if { }` entrelacés casse les accolades. **Après toute résolution scriptée**, relancer `pnpm -w typecheck` — deux endroits déjà cassés dans `app.ts` et `functions.ts` par le passé.
