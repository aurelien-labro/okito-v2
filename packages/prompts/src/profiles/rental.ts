import type { IndustryProfile } from "./types.js";

/**
 * Profil "location" — voitures, vélos, matériel, espaces.
 *
 * Pattern multi-jours comme l'hôtel (durée du séjour = durée de location),
 * mais ressource unique au lieu d'une chambre. Capacité = stock disponible.
 */
export const RENTAL_PROFILE: IndustryProfile = {
  industry: "rental",
  displayName: "Location",
  terms: {
    booking: "location",
    customer: "client",
    partyUnit: null,
  },
  fields: [
    {
      key: "serviceType",
      question: "Que souhaitez-vous louer ? (modèle, type de matériel)",
      acknowledgement: "Bien noté.",
      required: true,
    },
    {
      key: "checkInDate",
      question: "Pour quelle date de prise en charge ?",
      acknowledgement: "C'est noté.",
      required: true,
    },
    {
      key: "checkOutDate",
      question: "Et quelle date de retour ?",
      acknowledgement: "Très bien.",
      required: true,
    },
    {
      key: "customerName",
      question: "À quel nom la location ?",
      acknowledgement: "Merci.",
      required: true,
    },
    {
      key: "customerPhone",
      question: "Votre numéro de téléphone ?",
      acknowledgement: "C'est bon.",
      required: true,
    },
    {
      key: "customerEmail",
      question: "Et une adresse email pour le contrat de location ?",
      acknowledgement: "Parfait.",
      required: true,
    },
    {
      key: "notes",
      question: "Une précision (accessoires, jeune conducteur, kilométrage prévu) ?",
      acknowledgement: "Noté.",
      required: false,
    },
  ],
  prompt: {
    role: "Tu es l'assistant de réservation de location de {restaurantName}.",
    mission:
      "Aider le client à réserver, prolonger ou annuler une location (voiture, vélo, matériel, espace).",
    domainRules:
      "Une location va de checkInDate (prise en charge) à checkOutDate (retour) inclus côté facturation.\n" +
      "Toujours demander le modèle/type AVANT les dates : la dispo dépend du stock.\n" +
      "Email obligatoire : contrat de location envoyé par écrit.\n" +
      "Pour prolonger, c'est une modification d'une location existante (mise à jour de checkOutDate), pas une nouvelle.\n" +
      "Jamais inventer un tarif ni une caution — renvoyer vers l'équipe au comptoir.",
    examples:
      "User: « Je voudrais louer une Clio du 10 au 15 août »\n" +
      "→ check_availability(serviceType=Clio, checkInDate=2026-08-10, checkOutDate=2026-08-15), demander email.\n\n" +
      "User: « Je dois prolonger ma location jusqu'à dimanche »\n" +
      "→ retrouver via téléphone, update_reservation avec nouveau checkOutDate.\n\n" +
      "User: « Combien ça coûte ? »\n" +
      "→ « Le tarif vous sera confirmé par l'équipe au comptoir avec le contrat. » puis continuer.",
  },
  defaults: {
    bookingDurationMinutes: 1440,
    bufferMinutes: 0,
  },
};
