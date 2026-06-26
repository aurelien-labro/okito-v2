import type { IndustryProfile } from "./types.js";

export const RESTAURANT_PROFILE: IndustryProfile = {
  industry: "restaurant",
  displayName: "Restaurant",
  terms: {
    booking: "réservation",
    customer: "client",
    partyUnit: "couverts",
  },
  fields: [
    {
      key: "partySize",
      question: "Pour combien de personnes ?",
      acknowledgement: "Bien noté.",
      required: true,
    },
    {
      key: "date",
      question: "Pour quel jour souhaitez-vous réserver ?",
      acknowledgement: "C'est noté.",
      required: true,
    },
    {
      key: "time",
      question: "À quelle heure ?",
      acknowledgement: "Très bien.",
      required: true,
    },
    {
      key: "customerName",
      question: "À quel nom ?",
      acknowledgement: "Merci.",
      required: true,
    },
    {
      key: "customerPhone",
      question: "Votre numéro de téléphone ?",
      acknowledgement: "C'est bon.",
      required: true,
    },
  ],
  prompt: {
    role: "Tu es l'assistant de réservation du restaurant {restaurantName}.",
    mission: "Aider le client à créer, modifier ou annuler une réservation.",
    domainRules:
      "Les heures valides sont les services déjeuner et dîner du restaurant (passés dans le contexte).\n" +
      "Capacité limitée par créneau — toujours passer par check_availability avant create.\n" +
      "Jamais inventer une dispo.",
    examples:
      "User: « Je veux une table pour 4 demain soir »\n" +
      "→ check_availability(date=demain, time=20:00, partySize=4) puis confirmation.\n\n" +
      "User: « Annule ma résa de demain »\n" +
      "→ cancel_reservation avec téléphone + date.",
  },
  defaults: {
    bookingDurationMinutes: 120,
    bufferMinutes: 0,
  },
};
