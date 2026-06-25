/**
 * Mots-clés détectant l'intention d'annulation (FR).
 * Source de vérité : BUSINESS_RULES.md — toute modification ici doit y être répercutée.
 */
export const CANCELLATION_KEYWORDS = [
  "annule",
  "annuler",
  "annulation",
  "annulé",
  "cancel",
  "cancelled",
  "supprime",
  "supprimer",
  "suppression",
  "enleve",
  "enlève",
  "enlever",
  "retire",
  "retirer",
] as const;

export type CancellationKeyword = (typeof CANCELLATION_KEYWORDS)[number];
