/**
 * Détection de langue heuristique (keyword-based, zéro dépendance).
 * Objectif : faire répondre l'assistant dans la langue du client dès le 1er
 * message. On ne vise pas la précision d'un modèle NLP — juste distinguer
 * FR / EN / ES / DE / IT / PT / NL sur des messages courts de prise de rendez-vous.
 *
 * Défaut : "fr" (marché historique). En cas d'ambiguïté, on ne bascule pas.
 */
export const SUPPORTED_LANGUAGES = ["fr", "en", "es", "de", "it", "pt", "nl"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const MARKERS: Record<Exclude<Language, "fr">, RegExp[]> = {
  en: [
    /\b(hello|hi|hey|please|thanks|thank you|book|booking|table|reservation|tonight|tomorrow|people|for|at|would|like|can i|i want|i'd like|available)\b/i,
  ],
  es: [
    /\b(hola|buenos|buenas|gracias|por favor|quiero|quisiera|reserva|reservar|mesa|personas|para|mañana|esta noche|puedo|disponible)\b/i,
  ],
  de: [
    /\b(hallo|guten tag|guten abend|bitte|danke|ich möchte|ich hätte gern|reservieren|reservierung|tisch|personen|für|morgen|heute abend|verfügbar|können|termin|uhr)\b/i,
  ],
  it: [
    /\b(ciao|buongiorno|buonasera|grazie|per favore|vorrei|prenotare|prenotazione|tavolo|persone|per|domani|stasera|disponibile|posso|alle)\b/i,
  ],
  pt: [
    /\b(olá|ola|bom dia|boa noite|obrigado|obrigada|por favor|gostaria|quero|reservar|reserva|mesa|pessoas|para|amanhã|hoje à noite|disponível|posso)\b/i,
  ],
  nl: [
    /\b(hallo|goedemiddag|goedenavond|alstublieft|dank u|bedankt|ik wil|graag|reserveren|reservering|tafel|personen|voor|morgen|vanavond|beschikbaar|kan ik)\b/i,
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
  const scores = { fr: countMatches(message, FR_MARKERS) } as Record<Language, number>;
  for (const lang of Object.keys(MARKERS) as Array<Exclude<Language, "fr">>) {
    scores[lang] = MARKERS[lang].reduce((n, p) => n + countMatches(message, p), 0);
  }

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
  de: "Antworte auf Deutsch. Der Kunde schreibt auf Deutsch — spiegle seine Sprache natürlich wider und behalte denselben warmen, menschlichen Ton bei.",
  it: "Rispondi in italiano. Il cliente scrive in italiano — rispecchia la sua lingua con naturalezza, mantenendo lo stesso tono umano e caloroso.",
  pt: "Responde em português. O cliente escreve em português — espelha o idioma dele com naturalidade, mantendo o mesmo tom humano e caloroso.",
  nl: "Antwoord in het Nederlands. De klant schrijft in het Nederlands — spiegel zijn taal op een natuurlijke manier, met dezelfde warme, menselijke toon.",
};
