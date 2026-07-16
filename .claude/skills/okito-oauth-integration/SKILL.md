---
name: okito-oauth-integration
description: Pattern OAuth OKITO pour brancher une nouvelle intégration (Gmail, Outlook, Google Business, Calendar, Stripe Connect…). Utiliser dès qu'on ajoute une connexion tierce avec consentement utilisateur.
---

# Pattern OAuth pour une nouvelle intégration

## Modèle
Chaque intégration = 1 table `tenant_<service>` avec colonnes minimales :
```
id uuid pk, tenant_id uuid fk, external_account_id text,
access_token_enc text, refresh_token_enc text,
scopes text[], connected_at timestamptz, last_synced_at timestamptz,
delta_token text null   -- si sync incrémentale
```
+ RLS multi-tenant. Voir [okito-migration] pour l'ajout.

## Chiffrement tokens — obligatoire
- Tous les tokens sont chiffrés au repos via `SecretBox` (AES-256-GCM, clé `MAILBOX_ENC_KEY`).
- **Les tokens ne sortent JAMAIS par l'API** (invariant de sécu). Les routes admin retournent au max `{ connected: true, email }`.
- Pattern lecture : `SafeMailbox.forTenant(tenantId)` → décrypte en mémoire, expose des méthodes métier (`sendEmail`, `listMessages`…).

## Flow OAuth — les 3 endpoints
1. **`POST /v1/admin/oauth/<service>/start`** (auth admin requise)
   - Génère un `state` = signature HMAC de `{ tenantId, ts, nonce }` valide 10 min.
   - Le stocke aussi côté serveur (Map en mémoire process) pour double-check.
   - Retourne `{ url }` = l'URL de consentement.

2. **`GET /oauth/<service>/callback`** (public, pas d'auth)
   - Vérifie signature HMAC du state + présence en mémoire (invalide et retire après usage).
   - Échange le `code` contre les tokens.
   - Chiffre + insère/upsert dans `tenant_<service>`.
   - Redirect vers `/integrations` avec `?connected=<service>`.

3. **`POST /v1/admin/oauth/<service>/disconnect`**
   - Supprime la ligne, révoque côté fournisseur si l'API le permet.

## Gotcha à ne pas répéter
**Ne jamais déclencher deux `/start` d'affilée** (ex : `onClick` du bouton + navigation JS). Les states en mémoire process se mélangent → le callback échoue avec « State OAuth inconnu ou expiré ». Un seul déclencheur.

## Sync
- **OAuth récent + refresh token** → cron 5 min via Inngest. Refresh le token si `expires_at < now + 60s`.
- **Delta / webhook** disponible côté fournisseur (Microsoft Graph, Google Push) → préférer au polling.
- Chaque item synchronisé émet un event métier (`email.received`, `google_business.review.received`, `calendar.event.imported`…). Voir [okito-jarvis-tool] pour brancher une boucle dessus.

## UI côté /integrations
- Carte avec logo + statut (connecté / non connecté + email si connecté).
- Bouton unique « Connecter » qui fait `POST /start` puis `window.location = url`.
- Si connecté : bouton « Déconnecter » + timestamp `last_synced_at`.

## Env à poser côté GCP/Azure/etc.
- Redirect URI **dev** : `http://localhost:3001/oauth/<service>/callback`
- Redirect URI **prod** : `https://api.okito.app/oauth/<service>/callback` (à ajouter aux URI autorisées)
- Renommer l'écran de consentement en « OKITO » (pas le nom historique du projet GCP) — c'est vu par les prospects.

## Références internes
- Modèle canonique : `MailboxService` (Gmail) et `microsoft-oauth.ts` (Outlook).
- Boucle complète end-to-end : Google Business (PR #118) — OAuth + sync + tool `review.reply`.
