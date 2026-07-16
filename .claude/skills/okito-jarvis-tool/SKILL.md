---
name: okito-jarvis-tool
description: Ajouter une nouvelle boucle autonome Jarvis (event → Observer propose → Guardrail → Executor → tool). Utiliser à chaque fois qu'on veut que Jarvis agisse tout seul sur un signal métier.
---

# Ajouter une boucle autonome Jarvis

Une boucle = un event métier qui déclenche une action que Jarvis exécute seul (avec fenêtre d'annulation).

## Les 4 pièces à coder

### 1. Émettre l'event
Depuis le service métier concerné, `EventBusService.emit({ tenantId, type: '<domain>.<verb>', payload })`. Fire-and-forget — un bus en panne ne doit **jamais** bloquer la logique métier (résa, facture, email).

Types existants pour référence : `review.submitted`, `invoice.overdue`, `supplier_invoice.due_soon`, `email.received`, `google_business.review.received`, `payment.received`, `calendar.event.imported`, `site.visit`.

### 2. Étendre l'Observer
Dans le cron 10 min de l'Observer, ajouter une règle : « si event X depuis N minutes et pas déjà d'action Y en cours → proposer action Y ».

**Idempotency dure** : avant `JarvisActionService.propose(...)`, vérifier qu'aucune action du même `(tenantId, type, targetId)` n'est déjà `pending`/`scheduled`. Sinon on double-relance.

### 3. Choisir la politique de garde-fou
- `auto` — Jarvis exécute immédiatement, sans fenêtre. Réservé aux actions **strictement** réversibles/inoffensives.
- `auto_cancellable` (défaut, 24h) — visible dans `/jarvis`, bouton Annuler. Utilisé pour email/relance/réponse avis.
- `approval` — attend un clic patron. Utilisé pour actions à impact fort (virement, décision client sensible).

**Défaut si non spécifié : `approval`.** Dans le doute, on demande.

### 4. Enregistrer le tool
Dans `apps/api/src/services/jarvis-tools/`, créer `<action-name>.ts` exportant :
```ts
export const <camelName>Tool: JarvisTool = {
  type: '<domain>.<verb>',
  async execute(ctx, action) { /* ... */ return { ok, summary, result }; }
};
```
Puis l'ajouter au registre dans `JarvisExecutor`.

Le tool doit être **idempotent** (relancer 2× produit le même résultat, pas un doublon).

## Checklist « nouvelle boucle »
- [ ] Event émis fire-and-forget depuis le service source
- [ ] Règle Observer avec dédoublonnage
- [ ] Politique guardrail choisie et justifiée
- [ ] Tool dans le registre, idempotent
- [ ] Test unit pglite : émettre l'event → tick observer → action proposée → tick executor → tool appelé → event de résultat
- [ ] Entrée dans le tableau « Boucles 100% autonomes » du `CAHIER-DES-CHARGES.md`

## Boucles déjà en prod (référence)
1. `review.submitted` → `review.reply` (LLM, 24h)
2. `invoice.overdue` → `invoice.remind` (LLM, 24h)
3. `supplier_invoice.due_soon` → `supplier_invoice.pay_reminder` (pas de LLM, 24h)
4. `google_business.review.received` → `google_business.review.reply` (LLM, publication sur la fiche)
