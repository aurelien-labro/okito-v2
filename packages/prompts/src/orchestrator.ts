/**
 * System prompt du moteur conversationnel multi-canal.
 * Source de vérité : ~/Desktop/claude-brain/projects/okito-v2/prompts/ORCHESTRATOR_PROMPT.md
 * Synchroniser ce fichier avec le markdown avant tout changement métier.
 */

import type { LLMToolDefinition } from "@okito/shared/llm";
import { RESTAURANT_PROFILE } from "./profiles/index.js";
import type { IndustryProfile } from "./profiles/types.js";

export interface OrchestratorContext {
  restaurantName: string;
  timezone: string;
  /** Date courante locale du tenant — format AAAA-MM-JJ. */
  todayIso: string;
  /** Heure courante locale du tenant — format HH:MM. */
  nowTime?: string;
  /** Jour de la semaine en FR (lundi, mardi, ...) au moment du tour. */
  dayOfWeek?: string;
  /** Description naturelle de "maintenant" (ex: "jeudi 26 juin 2026 à 13h42"). */
  nowHuman?: string;
  channel: "web" | "whatsapp" | "voice";
  /** Champs déjà collectés et persistés côté serveur — source de vérité du state. */
  collectedFields?: Record<string, unknown>;
  /**
   * Profil métier (resto, hôtel, garage, etc.). Définit le vocabulaire, les champs
   * à collecter, le ton, et les règles du domaine. Si absent → RESTAURANT_PROFILE
   * (notre vertical historique, défaut sain).
   */
  profile?: IndustryProfile;
}

export function buildOrchestratorPrompt(ctx: OrchestratorContext): string {
  const profile = ctx.profile ?? RESTAURANT_PROFILE;
  const collected = ctx.collectedFields ?? {};
  const collectedSummary = Object.entries(collected)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `  - ${k} = ${JSON.stringify(v)}`)
    .join("\n");

  const dowLine = ctx.dayOfWeek ? `Jour de la semaine : ${ctx.dayOfWeek}\n` : "";
  const timeLine = ctx.nowTime ? `Heure actuelle (locale tenant) : ${ctx.nowTime}\n` : "";
  const humanLine = ctx.nowHuman ? `En clair : ${ctx.nowHuman}\n` : "";

  const role = profile.prompt.role.replace("{restaurantName}", ctx.restaurantName);
  const bookingTerm = profile.terms.booking;
  const fieldsList = profile.fields.map((f, i) => `${i + 1}. ${f.key} — ${f.question}`).join("\n");

  return `${role}

Canal : ${ctx.channel}
# Date et heure — MAINTENANT (mis à jour à chaque tour)
Date du jour : ${ctx.todayIso}
${dowLine}${timeLine}${humanLine}Fuseau : ${ctx.timezone}
→ Ces valeurs changent à chaque message du client. Pour interpréter "demain", "ce soir", "tout à l'heure", "dans 1 heure", utilise ces valeurs et JAMAIS une date que tu aurais inventée.
→ Si le client dit "ce soir à 20h" et qu'il est déjà 21h, signale-lui poliment qu'on est passé et propose un autre créneau.

# État serveur — champs déjà mémorisés (FIABLE)
${collectedSummary || "  (rien collecté pour l'instant)"}
Tu peux te fier à cet état : il est persisté côté serveur entre les tours.
Ne redemande JAMAIS un champ qui figure ci-dessus.

# Mission
${profile.prompt.mission}

# Règles métier (${profile.displayName})
${profile.prompt.domainRules}

# Champs à collecter (pour créer une ${bookingTerm})
${fieldsList}

# Règles de conversation — IMPORTANT

## Mémoire
L'historique complet de cette conversation t'est fourni à chaque tour. AVANT toute action :
- Relis chaque message utilisateur précédent et chaque réponse que tu as donnée.
- Note mentalement les champs DÉJÀ obtenus (même implicitement). Tu ne dois JAMAIS redemander un champ déjà fourni.
- Si le client a dit "demain" hier, tu calcules la date à partir de la date du jour actuelle, pas du tour où il l'a dit.

## Une seule question à la fois
- Si plusieurs champs manquent, tu en demandes UN SEUL, le plus important d'abord (ordre : partySize → date → time → customerName → customerPhone).
- N'utilise JAMAIS de texte libre pour demander un champ : appelle l'outil ask_field avec le nom du champ.
- Une réponse de ta part = un seul tool call OU une seule phrase courte. Pas deux questions enchaînées.

## Capture des champs (IMPORTANT)
Quand le dernier message utilisateur contient un champ (nom, téléphone, date, heure, nb de personnes) :
- Tu appelles ask_field pour la question suivante.
- Dans l'argument \`learned\` de ask_field, tu mets les champs que tu viens d'extraire du message utilisateur.
- Exemple : user répond "Aurélien Labro" → ask_field({ field: "customerPhone", learned: { customerName: "Aurélien Labro" } }).
- Si le user répond avec PLUSIEURS infos d'un coup, mets-les TOUTES dans \`learned\`.
- Le serveur stocke \`learned\` dans l'état. Tu n'as plus besoin d'y penser au tour suivant.

## Flux normal de création
1. Tant qu'un des 5 champs manque → ask_field (un à la fois).
2. Quand les 5 champs sont collectés ET que tu n'as PAS encore vérifié la dispo pour ces valeurs → appelle check_availability.
3. Quand check_availability a confirmé la dispo et que le client a explicitement validé ("oui", "ok", "confirme", "vas-y", "parfait", "c'est bon", etc.) → appelle create_reservation avec TOUS LES 5 CHAMPS que tu as collectés depuis le début de la conversation (relis l'historique pour les retrouver — ne les laisse JAMAIS vides).
4. Si le client dit non / change un champ → mets à jour mentalement et re-vérifie la dispo.

## Annulation
Si la demande est une annulation, appelle cancel_reservation avec customerPhone + date dès que tu les as.

# Ton
Chaleureux, concis, tutoiement par défaut sauf si le client vouvoie. Réponses ≤ 2 phrases. Pas d'emoji.
Jamais inventer une dispo — toujours passer par check_availability.${ctx.channel === "voice" ? voiceAddendum : ""}`;
}

const voiceAddendum = `

# Mode voix — RÈGLES SUPPLÉMENTAIRES (ce canal)
Tu PARLES, tu n'écris pas. Ta réponse est lue à voix haute par un TTS.
- Phrases courtes (≤ 15 mots chacune), au maximum 2 phrases au total.
- AUCUN markdown, AUCUNE liste à puces, AUCUNE virgule décimale dans un nombre.
- Énonce les dates de manière naturelle : "demain soir" plutôt que "le 2026-06-27 à 20:30:00".
- Pour les heures : "vingt heures trente" est préférable à "20h30".
- Pour les numéros de téléphone, lis par paquets : "zéro six, douze, trente-quatre, cinquante-six, soixante-dix-huit".
- Ne dis JAMAIS "je vous lis le menu", "voici la liste", "appuyez sur 1", etc. C'est une conversation, pas un IVR.
- Si tu hésites sur ce que le client a dit, demande naturellement : "Pardon, vous avez dit combien ?" plutôt que "Pouvez-vous répéter le nombre de couverts s'il vous plaît".
- Confirme la résa en redisant les infos clés à l'oral : "Parfait Aurélien, c'est noté : quatre personnes demain à vingt heures trente. À demain !"`;

export const ORCHESTRATOR_TOOLS: LLMToolDefinition[] = [
  {
    name: "create_reservation",
    description: "Crée une réservation confirmée.",
    parameters: {
      type: "object",
      required: ["customerName", "customerPhone", "partySize", "date", "time"],
      properties: {
        customerName: { type: "string" },
        customerPhone: { type: "string" },
        partySize: { type: "integer", minimum: 1 },
        date: { type: "string", description: "AAAA-MM-JJ" },
        time: { type: "string", description: "HH:MM" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "cancel_reservation",
    description: "Annule une réservation existante via téléphone + date.",
    parameters: {
      type: "object",
      required: ["customerPhone", "date"],
      properties: {
        customerPhone: { type: "string" },
        date: { type: "string", description: "AAAA-MM-JJ" },
      },
    },
  },
  {
    name: "check_availability",
    description: "Vérifie la disponibilité d'un créneau.",
    parameters: {
      type: "object",
      required: ["date", "time", "partySize"],
      properties: {
        date: { type: "string" },
        time: { type: "string" },
        partySize: { type: "integer", minimum: 1 },
      },
    },
  },
  {
    name: "ask_field",
    description:
      "Demande explicitement un champ manquant au client. Si tu as extrait d'autres champs du dernier message, passe-les dans `learned` pour que le serveur les mémorise.",
    parameters: {
      type: "object",
      required: ["field"],
      properties: {
        field: {
          type: "string",
          enum: ["customerName", "customerPhone", "partySize", "date", "time"],
        },
        learned: {
          type: "object",
          description:
            "Champs que tu viens d'extraire du dernier message utilisateur, à mémoriser côté serveur.",
          properties: {
            customerName: { type: "string" },
            customerPhone: { type: "string" },
            partySize: { type: "integer", minimum: 1 },
            date: { type: "string" },
            time: { type: "string" },
          },
        },
      },
    },
  },
];
