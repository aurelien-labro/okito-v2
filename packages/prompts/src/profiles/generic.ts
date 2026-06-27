import type { IndustryProfile } from "./types.js";

/**
 * Profil "générique" — catch-all pour un service à booking qui ne rentre
 * dans aucune des catégories précédentes (consultant, formateur, coach,
 * thérapeute, conseiller financier, etc.).
 *
 * Pattern : créneau ponctuel, 1 personne, vocabulaire neutre. Sert aussi
 * de défaut sain quand un nouveau tenant n'a pas encore choisi son vertical.
 */
export const GENERIC_PROFILE: IndustryProfile = {
  industry: "generic",
  displayName: "Service à rendez-vous",
  terms: {
    booking: "rendez-vous",
    customer: "client",
    partyUnit: null,
  },
  fields: [
    {
      key: "date",
      question: "Pour quel jour ?",
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
      question: "Votre téléphone pour vous joindre ?",
      acknowledgement: "C'est bon.",
      required: true,
    },
    {
      key: "customerEmail",
      question: "Et un email pour la confirmation ?",
      acknowledgement: "Parfait.",
      required: false,
    },
    {
      key: "notes",
      question: "Un détail sur l'objet du rendez-vous ?",
      acknowledgement: "Noté.",
      required: false,
    },
  ],
  prompt: {
    role: "Tu es l'assistant de prise de rendez-vous de {restaurantName}.",
    mission: "Aider le client à prendre, modifier ou annuler un rendez-vous.",
    domainRules:
      "Toujours passer par check_availability avant create_reservation.\n" +
      "Ne pas inventer le contenu ou le tarif d'une prestation que tu ne connais pas — laisser le pro le décrire au RDV.\n" +
      "Pour modifier ou annuler, retrouver via téléphone + date.",
    examples:
      "User: « J'aimerais un rendez-vous mardi matin »\n" +
      "→ check_availability(date=mardi, time=10:00) puis confirmation.\n\n" +
      "User: « Annule mon RDV »\n" +
      "→ retrouver via téléphone, cancel_reservation.",
  },
  defaults: {
    bookingDurationMinutes: 60,
    bufferMinutes: 10,
  },
};
