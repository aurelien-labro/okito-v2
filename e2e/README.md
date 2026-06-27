# OKITO E2E — Playwright

Tests end-to-end qui pilotent un vrai navigateur (Chromium headless en CI, mode UI en local) contre l'API + le dashboard.

## Premier setup

```bash
cd e2e
pnpm install                  # depuis la racine du repo en pratique
pnpm install:browsers         # télécharge Chromium (~150 MB une seule fois)
```

## Lancer les tests

```bash
# Headless (CI-style)
pnpm test

# Mode UI interactif (debug + replay)
pnpm test:ui

# Voir le rapport HTML après un run
pnpm report
```

Playwright démarre automatiquement l'API (port 3001) et le dashboard (port 3000) via la directive `webServer` de `playwright.config.ts`. Pas besoin de les lancer à la main.

## Pré-requis dev sans Supabase Auth

Le dashboard a un `LoginGate` qui exige un JWT. En dev sans Supabase Auth :

1. Lance le dashboard une fois (`pnpm --filter @okito/dashboard dev`)
2. Va sur `http://localhost:3000`
3. Console navigateur :
   ```js
   localStorage.setItem("okito_token", "00000000-0000-4000-8000-000000000001")
   ```
4. F5

L'API accepte le bypass dev tant que `SUPABASE_JWT_SECRET` n'est pas set en env. Les tests E2E supposent ce setup.

## Ajouter un test

Crée `tests/<feature>.spec.ts` et utilise les helpers Playwright :

```ts
import { test, expect } from "@playwright/test";

test("ma feature", async ({ page }) => {
  await page.goto("/mon/chemin");
  await expect(page.getByRole("heading")).toBeVisible();
});
```

## CI

Le run E2E n'est **pas** câblé dans le pipeline CI par défaut — les browsers Playwright pèsent ~150 MB et démarrer les deux serveurs ralentit chaque run. À activer en step séparé "nightly" ou pre-deploy.
