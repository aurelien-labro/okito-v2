# OKITO V2

SaaS multi-tenant de réservation pour restaurants. Moteur conversationnel accessible via Voix (Vapi), WhatsApp (360dialog) et Widget Web. Dashboard manager Next.js.

> **Statut :** Phase 0 — bootstrap monorepo. Voir `CLAUDE.md` pour les principes non négociables et la doc projet complète dans `~/Desktop/claude-brain/projects/okito-v2/`.

## Démarrage rapide

```bash
pnpm install
cp .env.example .env  # remplir les clés
pnpm dev
```

- API : http://localhost:3001
- Dashboard : http://localhost:3000

## Scripts racine

| Script | Description |
|---|---|
| `pnpm dev` | Lance toutes les apps en parallèle (Turborepo) |
| `pnpm build` | Build de prod toutes apps + packages |
| `pnpm lint` | Biome lint sur tout le repo |
| `pnpm lint:fix` | Biome lint + autofix |
| `pnpm format` | Biome format en place |
| `pnpm typecheck` | TS check sur tous les packages |
| `pnpm test` | Vitest sur tous les packages |

## Structure

```
apps/        api (Hono) · dashboard (Next.js) · widget (Vite)
packages/    shared · db (Drizzle) · prompts
infra/       supabase migrations · fly config
```

Architecture détaillée : `~/Desktop/claude-brain/projects/okito-v2/STRUCTURE.md`.

## Licence

Propriétaire — © Aurélien Labro.
