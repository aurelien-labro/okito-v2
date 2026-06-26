/**
 * Profil métier (industry profile) — décrit comment l'orchestrator doit se comporter
 * pour un type d'entreprise donné (restaurant, hôtel, garage, etc.).
 *
 * Permet de réutiliser le même ChatService + LLM + voix + canaux pour TOUS les
 * verticaux, sans dupliquer le code. Le profile change uniquement :
 *   - le vocabulaire ("réservation" vs "rendez-vous")
 *   - les champs à collecter
 *   - les sections personnalisables du prompt (mission, ton, exemples)
 *   - quelques défauts (durée d'un booking, buffer entre deux)
 */

export type Industry =
  | "restaurant"
  | "hotel"
  | "garage"
  | "beauty"
  | "realestate"
  | "rental"
  | "generic";

export type BookingFieldKey =
  | "partySize"
  | "date"
  | "time"
  | "customerName"
  | "customerPhone"
  | "customerEmail"
  // Champs sectoriels (à étendre au fil des verticaux) :
  | "checkInDate"
  | "checkOutDate"
  | "adultsCount"
  | "childrenCount"
  | "vehiclePlate"
  | "serviceType"
  | "estimatedDuration"
  | "address"
  | "notes";

export interface BookingField {
  key: BookingFieldKey;
  /** Question naturelle à poser au client si manquant. */
  question: string;
  /** Phrase courte que le bot dit quand il vient d'apprendre le champ (mode voix). */
  acknowledgement?: string;
  /** Si false, le champ est facultatif. Défaut true. */
  required?: boolean;
}

export interface IndustryProfile {
  industry: Industry;
  /** Nom affiché ("Restaurant", "Hôtel & gîtes", "Garage auto", …). */
  displayName: string;
  /** Vocabulaire métier — utilisé dans les messages au client. */
  terms: {
    /** "réservation" / "rendez-vous" / "visite" / "location" */
    booking: string;
    /** "client" / "client·e" / "patient" / "locataire" */
    customer: string;
    /** "couverts" / "personnes" / "occupants" / null si pas pertinent */
    partyUnit: string | null;
  };
  /** Champs à collecter, dans l'ordre logique de questionnement. */
  fields: BookingField[];
  /** Sections de prompt qui changent par vertical. */
  prompt: {
    /** "Tu es l'assistant de réservation du restaurant {name}." */
    role: string;
    /** Description de la mission métier. */
    mission: string;
    /** Règles spécifiques au métier (ex: hôtel = 1 nuit min, garage = créneau atelier). */
    domainRules: string;
    /** Exemples conversationnels métier (3-5 lignes en français). */
    examples: string;
  };
  defaults: {
    /** Durée d'un booking en minutes (resto = 120, garage = 60, hôtel = nuits → ignoré). */
    bookingDurationMinutes: number;
    /** Buffer entre deux bookings de la même ressource (minutes). */
    bufferMinutes: number;
  };
}
