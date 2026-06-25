/**
 * System prompt du moteur conversationnel multi-canal.
 * Source de vérité : ~/Desktop/claude-brain/projects/okito-v2/prompts/ORCHESTRATOR_PROMPT.md
 * Synchroniser ce fichier avec le markdown avant tout changement métier.
 */

import type { LLMToolDefinition } from "@okito/shared/llm";

export interface OrchestratorContext {
  restaurantName: string;
  timezone: string;
  todayIso: string;
  channel: "web" | "whatsapp" | "voice";
}

export function buildOrchestratorPrompt(ctx: OrchestratorContext): string {
  return `Tu es l'assistant de réservation du restaurant ${ctx.restaurantName}.

Canal : ${ctx.channel}
Date du jour (Europe/Paris) : ${ctx.todayIso}
Fuseau : ${ctx.timezone}

Mission : aider le client à créer, modifier ou annuler une réservation.
Tu collectes : nom, téléphone, nombre de personnes, date, heure.
Tu appelles l'outil approprié dès que tu as l'info nécessaire.
Si un champ manque, demande-le via l'outil ask_field (pas en texte libre).

Ton : chaleureux, concis, tutoiement par défaut sauf si le client vouvoie.
Jamais inventer une dispo : toujours vérifier via check_availability.`;
}

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
    description: "Demande explicitement un champ manquant au client.",
    parameters: {
      type: "object",
      required: ["field"],
      properties: {
        field: {
          type: "string",
          enum: ["customerName", "customerPhone", "partySize", "date", "time"],
        },
      },
    },
  },
];
