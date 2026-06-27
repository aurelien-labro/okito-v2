# Déploiement Fly.io — OKITO V2

Guide complet pour passer du repo local à un déploiement prod sur Fly.io.

## Pré-requis

1. Compte Fly.io avec **carte de paiement ajoutée** (Account → Billing).
2. CLI `flyctl` installée localement :
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```
3. Repo cloné + `pnpm install` ok en local.

## Architecture cible

| App | Domain | Région | Image |
|---|---|---|---|
| `okito-api` | `api.okito.app` (CNAME) | `cdg` (Paris) | Node.js Hono |
| `okito-dashboard` | `dashboard.okito.app` | `cdg` | Next.js 15 standalone |
| `okito-widget-cdn` | Cloudflare R2 / Bunny CDN | global | Static JS bundle |

DB Postgres = **Supabase EU Paris** (déjà en prod), pas Fly Managed Postgres.

## 1. Déployer l'API

```bash
cd apps/api
fly launch --no-deploy --copy-config --name okito-api
```

Puis configurer les secrets (un seul appel) :

```bash
fly secrets set \
  DATABASE_URL="postgresql://..." \
  SUPABASE_JWT_SECRET="..." \
  GEMINI_API_KEY="..." \
  RESEND_API_KEY="re_..." \
  RESEND_FROM_EMAIL="OKITO <bot@okito.app>" \
  TWILIO_ACCOUNT_SID="AC..." \
  TWILIO_AUTH_TOKEN="..." \
  TWILIO_WHATSAPP_FROM="+14155238886" \
  TWILIO_SMS_FROM="+33756..." \
  TWILIO_VALIDATE_WEBHOOK="true" \
  VAPI_WEBHOOK_SECRET="$(openssl rand -hex 32)" \
  INNGEST_SIGNING_KEY="signkey-..." \
  SENTRY_DSN="https://...@sentry.io/..."
```

Puis :

```bash
fly deploy
```

Vérifier :

```bash
fly status
curl https://okito-api.fly.dev/health | jq
```

Le `/health` doit afficher tous les providers en `configured`.

## 2. Déployer le dashboard

```bash
cd apps/dashboard
fly launch --no-deploy --copy-config --name okito-dashboard

fly secrets set \
  NEXT_PUBLIC_OKITO_API_URL="https://okito-api.fly.dev" \
  NEXT_PUBLIC_SUPABASE_URL="https://etlhjsypfynjyzulvkut.supabase.co" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="ey..."

fly deploy
```

## 3. Déployer le widget (static)

Le widget est un seul fichier JS — pas besoin de Fly. Upload sur un CDN.

```bash
cd apps/widget
pnpm build           # → dist/widget.js (~10 KB minifié)

# Cloudflare R2 (ou tout S3-compatible)
aws s3 cp dist/widget.js s3://okito-widget/v1/widget.js \
  --cache-control "public, max-age=3600" \
  --content-type "application/javascript"
```

Servir via `https://widget.okito.app/v1/widget.js` (CNAME R2 ou Bunny).

## 4. Domaine custom (optionnel)

Pour `api.okito.app` :

```bash
fly certs add api.okito.app -a okito-api
```

Puis CNAME `api.okito.app` → `okito-api.fly.dev` chez ton registrar.

## 5. Inngest cloud (cron rappels)

1. https://app.inngest.com → créer un compte
2. Add app → URL = `https://okito-api.fly.dev/api/inngest`
3. Copier `INNGEST_SIGNING_KEY` → `fly secrets set INNGEST_SIGNING_KEY=...`
4. Vérifier que `dailyReminders` apparaît dans le dashboard Inngest.

## Monitoring

- **Logs** : `fly logs -a okito-api`
- **Métriques** : Grafana Fly intégré (auto-scrape `/metrics`) → cherche `okito_*`
- **Sentry** : alertes erreurs serveur

## Troubleshooting

- **Build échoue Docker** : `fly deploy --build-only --remote-only` pour itérer sans push
- **Health check fail** : `fly logs` puis vérifier que `/health` répond 200 même sans toutes les secrets
- **OOM** : `fly scale memory 1024` (ou ajuster `[[vm]] memory` dans fly.toml)
