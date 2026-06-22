# CLAUDE.md — Template à copier à la racine du repo `okito-v2`

> Ce fichier sera lu automatiquement par Claude Code lors de chaque session sur le repo OKITO V2.
> Copier le contenu ci-dessous dans `okito-v2/CLAUDE.md` du repo Git.

---

# OKITO V2 — SaaS Réservation Multi-Restaurants

## Vue d'ensemble
Monorepo TypeScript multi-tenant. Moteur de réservation conversationnel accessible via Voix (Vapi), WhatsApp (360dialog), Widget Web. Dashboard manager Next.js.

Documentation projet complète : `~/Desktop/claude-brain/projects/okito-v2/`

## Stack
- Backend : Hono + TypeScript (Node 22)
- DB : Supabase Postgres (région EU Paris) + Drizzle ORM
- Frontend : Next.js 15 + Tailwind + shadcn/ui
- LLM : Claude Haiku 4.5 (`claude-haiku-4-5`) — fallback Sonnet 4.6
- Jobs : Inngest
- Tests : Vitest (unit) + Playwright (E2E)
- Hosting : Fly.io (api) + Vercel (dashboard)

## Principes non négociables

**1. Multi-tenant strict** — Aucune query sans `WHERE tenant_id = ?`. Tests RLS obligatoires.

**2. Coût LLM contrôlé** — `LLM_MODEL=claude-haiku-4-5` en dev, mock dans les tests unitaires, cache local en dev. Sonnet 4.6 réservé aux cas où Haiku échoue (retry pattern).

**3. Idempotency** — Toute opération de création/modification doit être idempotente. Une résa = une contrainte unique `(tenant_id, customer_phone, date, heure)`.

**4. Validation aux frontières** — Zod sur tous les inputs API. Pas de validation défensive à l'intérieur.

**5. Conventions de commit** — Conventional Commits (`feat:`, `fix:`, `chore:`). Une feature = une PR.

**6. Tests obligatoires** — Toute logique métier (validation, capacité, annulation) a des tests unitaires Vitest. E2E Playwright sur les flows critiques.

## Comment démarrer

```bash
pnpm install
cp .env.example .env  # remplir les clés
pnpm --filter @okito/db migrate:push
pnpm tsx scripts/seed-dev.ts
pnpm dev
```

- Dashboard : http://localhost:3000
- API : http://localhost:3001
- Page test moteur : http://localhost:3000/test

## Structure
Voir `~/Desktop/claude-brain/projects/okito-v2/STRUCTURE.md` pour l'arborescence et la justification.

## Règles métier
Source de vérité : `~/Desktop/claude-brain/projects/okito-v2/BUSINESS_RULES.md`. Toute modification des règles métier doit y être répercutée AVANT le code.

## Prompts Claude
Source de vérité : `~/Desktop/claude-brain/projects/okito-v2/prompts/`. Le code dans `packages/prompts/` doit refléter ces fichiers.

## Routine fin de session
Mettre à jour `~/Desktop/claude-brain/projects/okito-v2/PROJECT.md` section "Log de sessions" avec :
- Ce qui a été fait
- Décisions prises + raison
- Problèmes rencontrés + solutions
- Prochaine étape prioritaire

## Sécurité
- **Jamais** commit `.env`, clés API, ou credentials
- Toutes les clés via variables d'env
- Sentry redact les PII (téléphones, emails) avant envoi
- GDPR : registre des traitements à tenir à jour dans `docs/GDPR.md` (Phase 5)

## Anti-patterns à éviter

- ❌ `any` en TS sans justification commentée
- ❌ Query SQL sans `WHERE tenant_id`
- ❌ Appel LLM sans `LLM_MODEL` env var (toujours configurable)
- ❌ Test unitaire qui appelle vraiment Anthropic API (mock obligatoire)
- ❌ Fonction qui throw une string (utiliser classes d'erreur typées)
- ❌ `console.log` en code de prod (logger structuré uniquement)
- ❌ Migration Drizzle non testée localement avant push
- ❌ PR > 600 LOC sans découpe préalable

## Commandes utiles Claude Code

- `/code-review` avant de merger
- `/verify` après une modification UI pour tester en vrai navigateur
- `/security-review` avant phase 5 (paiement Stripe)
