/**
 * Détection de langue heuristique (keyword-based, zéro dépendance).
 * Objectif : faire répondre l'assistant dans la langue du client dès le 1er
 * message. On ne vise pas la précision d'un modèle NLP — juste distinguer
 * FR / EN / ES sur des messages courts de prise de rendez-vous.
 *
 * Défaut : "fr" (marché historique). En cas d'ambiguïté, on ne bascule pas.
 */
export const SUPPORTED_LANGUAGES = ["fr", "en", "es"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const MARKERS: Record<Exclude<Language, "fr">, RegExp[]> = {
  en: [
    /\b(hello|hi|hey|please|thanks|thank you|book|booking|table|reservation|tonight|tomorrow|people|for|at|would|like|can i|i want|i'd like|available)\b/i,
  ],
  es: [
    /\b(hola|buenos|buenas|gracias|por favor|quiero|quisiera|reserva|reservar|mesa|personas|para|mañana|esta noche|puedo|disponible)\b/i,
  ],
};

const FR_MARKERS =
  /\b(bonjour|salut|merci|s'il|réserver|réservation|table|couverts|personnes|demain|ce soir|voudrais|je veux|pour|à|disponible|places?)\b/i;

/**
 * Retourne la langue détectée. Compte les marqueurs par langue ; la mieux
 * scorée gagne. À égalité ou absence de signal → fr.
 */
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function countMatches(message: string, pattern: RegExp): number {
  const matches = message.match(new RegExp(pattern, "gi"));
  return matches ? matches.length : 0;
}

export function detectLanguage(message: string): Language {
  if (!message.trim()) return "fr";

  // Comptage global et symétrique pour toutes les langues : une phrase FR riche
  // ne doit pas perdre face à un mot isolé qui recoupe l'anglais ("table").
  const scores: Record<Language, number> = {
    fr: countMatches(message, FR_MARKERS),
    en: MARKERS.en.reduce((n, p) => n + countMatches(message, p), 0),
    es: MARKERS.es.reduce((n, p) => n + countMatches(message, p), 0),
  };

  // À égalité, fr l'emporte (défaut marché) car il est testé en premier.
  let best: Language = "fr";
  for (const lang of SUPPORTED_LANGUAGES) {
    if (scores[lang] > scores[best]) best = lang;
  }
  return best;
}

export const LANGUAGE_DIRECTIVES: Record<Language, string> = {
  fr: "Réponds en français.",
  en: "Reply in English. The customer is writing in English — mirror their language naturally, keep the same warm human tone.",
  es: "Responde en español. El cliente escribe en español — refleja su idioma con naturalidad y el mismo tono humano y cálido.",
};
