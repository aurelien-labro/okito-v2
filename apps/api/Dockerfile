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

ENV NODE_ENV=production
ENV PORT=8080

# pnpm workspace : les deps de @okito/api sont des symlinks dans
# apps/api/node_modules → ../../node_modules/.pnpm. On reproduit donc la
# structure exacte du repo (racine + packages + apps/api) pour que la
# résolution Node fonctionne.
COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/packages /repo/packages
COPY --from=builder /repo/apps/api/node_modules /repo/apps/api/node_modules
COPY --from=builder /repo/apps/api/src /repo/apps/api/src
COPY --from=builder /repo/apps/api/package.json /repo/apps/api/package.json
COPY --from=builder /repo/apps/api/tsconfig.json /repo/apps/api/tsconfig.json
COPY --from=builder /repo/tsconfig.base.json /repo/tsconfig.base.json

WORKDIR /repo/apps/api
EXPOSE 8080
# Les packages workspace (@okito/db, etc.) exportent leurs sources .ts :
# on exécute via tsx (dépendance runtime), comme en dev.
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
