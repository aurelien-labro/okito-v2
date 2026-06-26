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

/**
 * Regex de détection rapide d'une intention d'annulation dans un message libre.
 * Insensible à la casse, gère les variantes courantes en raccourci avant un appel LLM.
 */
export const CANCELLATION_REGEX = /annul|cancel|supprim|enl[eè]v|retir/i;

export function isCancellationIntent(message: string): boolean {
  return CANCELLATION_REGEX.test(message);
}
