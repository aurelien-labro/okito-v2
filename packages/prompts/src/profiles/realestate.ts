import type { IndustryProfile } from "./types.js";

/**
 * Profil "immobilier" — agences pour visites de biens.
 *
 * Pattern distinct : 1 client = 1 visite d'un bien à une adresse précise.
 * Pas de capacité de salle / poste, mais un agent disponible par créneau.
 * Email + téléphone obligatoires (relances, dossier).
 */
export const REALESTATE_PROFILE: IndustryProfile = {
  industry: "realestate",
  displayName: "Agence immobilière",
  terms: {
    booking: "visite",
    customer: "client",
    partyUnit: null,
  },
  fields: [
    {
      key: "address",
      question: "Quel bien souhaitez-vous visiter ? (adresse ou référence)",
      acknowledgement: "Bien noté.",
      required: true,
    },
    {
      key: "date",
      question: "Pour quel jour la visite ?",
      acknowledgement: "C'est noté.",
      required: true,
    },
    {
      key: "time",
      question: "À quelle heure vous arrange ?",
      acknowledgement: "Très bien.",
      required: true,
    },
    {
      key: "customerName",
      question: "À quel nom prendre rendez-vous ?",
      acknowledgement: "Merci.",
      required: true,
    },
    {
      key: "customerPhone",
      question: "Votre téléphone pour vous joindre le jour J ?",
      acknowledgement: "C'est bon.",
      required: true,
    },
    {
      key: "customerEmail",
      question: "Et une adresse email pour la confirmation ?",
      acknowledgement: "Parfait.",
      required: true,
    },
    {
      key: "notes",
      question: "Une question particulière sur le bien avant la visite ?",
      acknowledgement: "Noté.",
      required: false,
    },
  ],
  prompt: {
    role: "Tu es l'assistant de prise de rendez-vous de l'agence {restaurantName}.",
    mission: "Aider le client à planifier, déplacer ou annuler une visite de bien immobilier.",
    domainRules:
      "Toujours demander l'adresse OU la référence du bien avant la date : la dispo dépend du bien et de l'agent attitré.\n" +
      "Email obligatoire : la confirmation et l'éventuel dossier locatif passent par écrit.\n" +
      "Jamais donner un avis sur le prix, l'état du bien ou la négociation — l'agent gère.\n" +
      "Si le client demande à voir plusieurs biens, créer un rendez-vous par bien (chaque visite a son créneau).\n" +
      "Pour reprogrammer, retrouver via téléphone + date OU bien + date.",
    examples:
      "User: « Je voudrais visiter l'appart de la rue Pasteur samedi »\n" +
      "→ demander la réf ou l'adresse précise, puis check_availability(address=..., date=samedi, time=14:00).\n\n" +
      "User: « Vous pouvez me dire le prix au mètre carré ? »\n" +
      "→ « C'est l'agent qui pourra vous renseigner précisément lors du rendez-vous. » puis continuer.\n\n" +
      "User: « Annule ma visite »\n" +
      "→ retrouver via téléphone + date, cancel_reservation.",
  },
  defaults: {
    bookingDurationMinutes: 45,
    bufferMinutes: 15,
  },
};
