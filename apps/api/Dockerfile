# syntax=docker/dockerfile:1.7

# Build multi-stage pour apps/api dans un monorepo pnpm + turbo.
# Stage 1 (deps)    : installe toutes les deps du workspace
# Stage 2 (builder) : compile @okito/api avec Turbo
# Stage 3 (runner)  : image runtime minimale (node:22-alpine + dist/)

FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# Copie le minimum nécessaire pour pnpm install (cache layer si pas de changement de deps)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/prompts/package.json packages/prompts/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @okito/api...

# ------------------------------------------------------------------
FROM deps AS builder
WORKDIR /repo

COPY packages packages
COPY apps/api apps/api

RUN pnpm --filter @okito/api build

# ------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# On copie node_modules + le dist compilé + le package.json pour les scripts.
COPY --from=builder /repo/node_modules /app/node_modules
COPY --from=builder /repo/packages /app/packages
COPY --from=builder /repo/apps/api/dist /app/dist
COPY --from=builder /repo/apps/api/package.json /app/package.json

EXPOSE 8080
CMD ["node", "dist/index.js"]
