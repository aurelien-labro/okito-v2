/**
 * Prompt de génération du message de confirmation (post-création/annulation).
 * Source de vérité : ~/Desktop/claude-brain/projects/okito-v2/prompts/CONFIRMATION_GENERATOR.md
 */

export interface ConfirmationContext {
  restaurantName: string;
  customerName: string;
  partySize: number;
  date: string;
  time: string;
  action: "created" | "cancelled" | "modified";
}

export function buildConfirmationPrompt(ctx: ConfirmationContext): string {
  const verb =
    ctx.action === "created" ? "confirmée" : ctx.action === "cancelled" ? "annulée" : "modifiée";

  return `Génère un message court (≤2 phrases) confirmant que la réservation a bien été ${verb}.
Restaurant : ${ctx.restaurantName}
Client : ${ctx.customerName}
Couverts : ${ctx.partySize}
Date : ${ctx.date} à ${ctx.time}
Ton : chaleureux, naturel, pas de formule administrative.`;
}
