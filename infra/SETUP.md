# OKITO V2 — Setup checklist

Tout ce qu'il faut configurer avant le 1er déploiement.

> Référence rapide : `cp .env.example .env` puis `pnpm check:env` pour voir ce qui manque.

---

## 1. Fly.io — carte de paiement

1. fly.io → **Dashboard → Personal → Billing**
2. **Add payment method** → CB → Save
3. Vérifier que le bandeau vert "Active" apparaît

Aucune variable d'env, juste un prérequis pour `fly deploy`.

---

## 2. Supabase — DB + Auth

> Projet déjà existant : `etlhjsypfynjyzulvkut.supabase.co` (EU Paris).

### Variables à récupérer

| Endroit | Variable |
|---|---|
| **Settings → Database → Connection string (URI)** | `DATABASE_URL` |
| **Settings → API → Project URL** | `SUPABASE_URL` |
| **Settings → API → anon public** | `SUPABASE_ANON_KEY` |
| **Settings → API → service_role secret** | `SUPABASE_SERVICE_ROLE_KEY` |
| **Settings → API → JWT Settings → JWT Secret** | `SUPABASE_JWT_SECRET` |

### Récupérer ton sub UUID (pour être admin)

1. **Authentication → Users**
2. Si ton user n'existe pas : lance le dashboard local (`pnpm --filter @okito/dashboard dev`), va sur `/login`, envoie-toi un magic link
3. Une fois ton user listé → copier la colonne **UID** (format `xxxxxxxx-xxxx-...`)
4. → `ADMIN_USER_IDS=<uuid>` (plusieurs admins = séparer par virgule)

### Appliquer les migrations
Studio → **SQL Editor** → coller le contenu de chaque fichier `infra/supabase/migrations/00{1..6}_*.sql` dans l'ordre, exécuter un par un.

---

## 3. Google AI Studio — Gemini

1. aistudio.google.com → **API Keys**
2. Create API key → copier `AIza...`
3. → `GEMINI_API_KEY=AIza...`

Garder les défauts : `LLM_MODEL=gemini-2.5-flash`, `LLM_FALLBACK_MODEL=gemini-2.5-pro`.

---

## 4. Vapi — voix

1. dashboard.vapi.ai → **Account → API Keys**
2. Copier "Private key" → `VAPI_API_KEY=`
3. Copier "Public key" → `VAPI_PUBLIC_KEY=`
4. **Assistants** → ton assistant OKITO → copier l'ID en haut → `VAPI_ASSISTANT_ID=`

> Assistant OKITO déjà créé : `a88631d5-d6ca-4ee8-8871-3fc897c53766`.

---

## 5. Resend — emails

1. resend.com/signup
2. **Domains → Add Domain** → ton domaine (ex `okito.app`)
3. Copier les 3 records DNS (TXT/MX) chez ton registrar (OVH, Cloudflare, etc.)
4. Attendre **Verified** (~10 min, parfois jusqu'à 1h)
5. **API Keys → Create API Key** → permission "Sending access" → copier `re_...`
6. → `RESEND_API_KEY=re_...`
7. → `RESEND_FROM_EMAIL=OKITO <bot@tondomaine.com>` (l'adresse doit être sur le domaine vérifié)

---

## 6. Twilio — WhatsApp + SMS

1. twilio.com/try-twilio → compte (CB pour passer le trial)
2. **Console → Account info** → copier "Account SID" + "Auth Token"
3. → `TWILIO_ACCOUNT_SID=AC...`
4. → `TWILIO_AUTH_TOKEN=...`

### Sandbox WhatsApp (pour tester sans setup Meta)
1. **Messaging → Try it out → Send a WhatsApp message**
2. Suivre l'étape : envoyer `join <code>` au numéro affiché (`+1 415 523 8886`) depuis ton WhatsApp
3. → `TWILIO_WHATSAPP_FROM=+14155238886`

### SMS (optionnel)
1. **Phone Numbers → Buy a number** (10€/mois pour un FR)
2. → `TWILIO_SMS_FROM=+33...`

### En prod
- Mettre `TWILIO_VALIDATE_WEBHOOK=true` pour vérifier les signatures
- Bouger du sandbox vers un numéro WhatsApp Business officiel (Meta Business verification, 3-5j)

---

## 7. Inngest cloud — cron rappels J-1

1. inngest.com/sign-up
2. **Create app** → nom : `okito-api`
3. **Settings → Signing Keys → Production** → copier `signkey-prod-...`
4. → `INNGEST_SIGNING_KEY=signkey-prod-...`
5. **Settings → Event Keys → Production** → copier
6. → `INNGEST_EVENT_KEY=...`
7. Une fois l'API déployée : **Apps → Sync** → URL : `https://<api>/api/inngest`

---

## 8. Stripe — abonnements (optionnel MVP)

1. stripe.com/register → compte (mode **test** par défaut, gratuit)
2. **Developers → API keys** → copier "Secret key" `sk_test_...`
3. → `STRIPE_SECRET_KEY=sk_test_...`
4. **Developers → Webhooks → Add endpoint**
5. URL : `https://<api>/v1/webhooks/stripe` (après deploy Fly)
6. Events à cocher : `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
7. Add endpoint → copier "Signing secret" → `STRIPE_WEBHOOK_SECRET=whsec_...`
8. **Products → Add product** :
   - "OKITO Basic" — €39/mois récurrent → noter le `price_...`
   - "OKITO Pro" — €69/mois récurrent → noter le `price_...`

### Test webhook local (avec stripe-cli)
```bash
stripe listen --forward-to localhost:3001/v1/webhooks/stripe
```

---

## 9. Sentry — observabilité (optionnel mais recommandé prod)

1. sentry.io → **Projects → Create project** → platform Node.js → nom `okito-api`
2. **Settings → Client Keys (DSN)** → copier le DSN
3. → `SENTRY_DSN=https://...@o....ingest.sentry.io/...`

---

## 10. 360dialog — WhatsApp BSP (optionnel, post-MVP)

À activer **uniquement** quand un tenant dépasse ~1000-2000 messages WhatsApp/mois pour économiser 30-40% sur le markup Twilio.

1. hub.360dialog.com → onboarding (vérif Meta Business → 3-5 jours)
2. **Settings → API Key** → copier `D3-...`
3. → `THREE60DIALOG_API_KEY=D3-...`
4. Le code (PR #42) prend automatiquement le relais sur Twilio pour le canal WhatsApp.

---

## Vérification finale

```bash
pnpm check:env           # mode dev (recommandé non-bloquant)
pnpm check:env:prod      # mode prod (recommandé devient required)
```

Tu devrais voir un rapport par groupe avec ✅ / ⚠️ / ❌. Tant que tu as ❌ rouge, l'API ne démarrera pas.

## Déploiement Fly une fois tout vert

```bash
cd apps/api
fly secrets set \
  DATABASE_URL=... \
  SUPABASE_URL=... \
  SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SUPABASE_JWT_SECRET=... \
  GEMINI_API_KEY=... \
  VAPI_API_KEY=... \
  VAPI_PUBLIC_KEY=... \
  VAPI_ASSISTANT_ID=... \
  RESEND_API_KEY=... \
  RESEND_FROM_EMAIL="OKITO <bot@...>" \
  TWILIO_ACCOUNT_SID=... \
  TWILIO_AUTH_TOKEN=... \
  TWILIO_WHATSAPP_FROM=+14155238886 \
  TWILIO_VALIDATE_WEBHOOK=true \
  INNGEST_SIGNING_KEY=... \
  INNGEST_EVENT_KEY=... \
  ADMIN_USER_IDS=<ton-uuid> \
  SENTRY_DSN=...

fly deploy
```

Suivre ensuite `infra/fly/DEPLOY.md` pour le dashboard + widget.
