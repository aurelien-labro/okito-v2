# syntax=docker/dockerfile:1.7

# Build multi-stage pour apps/landing (Next.js 15) dans un monorepo pnpm + turbo.
# Contexte de build = racine du repo :
#   flyctl deploy . --config apps/landing/fly.toml --dockerfile apps/landing/Dockerfile

FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/landing/package.json apps/landing/

RUN pnpm install --frozen-lockfile --filter @okito/landing...

# ------------------------------------------------------------------
FROM deps AS builder
WORKDIR /repo

COPY apps/landing apps/landing

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_STANDALONE=1

# Inliné au build par Next (lien « Se connecter » vers le dashboard).
ARG NEXT_PUBLIC_DASHBOARD_URL=https://okito-demo-dashboard.fly.dev
ENV NEXT_PUBLIC_DASHBOARD_URL=$NEXT_PUBLIC_DASHBOARD_URL

RUN pnpm --filter @okito/landing build

# ------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /repo/apps/landing/.next/standalone /app
COPY --from=builder /repo/apps/landing/.next/static /app/apps/landing/.next/static

EXPOSE 3000
WORKDIR /app/apps/landing
CMD ["node", "server.js"]
