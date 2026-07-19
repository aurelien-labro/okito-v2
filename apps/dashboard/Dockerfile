# syntax=docker/dockerfile:1.7

# Build multi-stage pour apps/dashboard (Next.js 15) dans un monorepo pnpm + turbo.

FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @okito/dashboard...

# ------------------------------------------------------------------
FROM deps AS builder
WORKDIR /repo

COPY packages packages
COPY apps/dashboard apps/dashboard

# Next 15 supporte le mode standalone — bundle minimal avec node_modules nécessaires.
ENV NEXT_TELEMETRY_DISABLED=1

# Vars NEXT_PUBLIC_* : Next les inline dans les chunks côté client au moment
# du build, pas au runtime — les passer en fly secrets ne suffit pas. Elles
# arrivent ici via `fly deploy --build-arg NEXT_PUBLIC_...=...`.
ARG NEXT_PUBLIC_OKITO_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_OKITO_API_URL=$NEXT_PUBLIC_OKITO_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN pnpm --filter @okito/dashboard build

# ------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Next standalone output : on n'a besoin que de .next/standalone + .next/static + public
COPY --from=builder /repo/apps/dashboard/.next/standalone /app
COPY --from=builder /repo/apps/dashboard/.next/static /app/apps/dashboard/.next/static
COPY --from=builder /repo/apps/dashboard/public /app/apps/dashboard/public

EXPOSE 3000
WORKDIR /app/apps/dashboard
CMD ["node", "server.js"]
