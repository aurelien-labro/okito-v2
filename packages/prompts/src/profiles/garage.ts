import type { IndustryProfile } from "./types.js";

/**
 * Profil "garage auto" — mécanique, carrosserie, contrôle technique.
 *
 * Différences clés vs resto :
 *   - on collecte vehiclePlate (immatriculation) ET serviceType (diag, vidange,
 *     révision, pneus) AVANT la date : la dispo dépend du poste atelier et de
 *     la durée intervention.
 *   - durée très variable selon serviceType (15 min pour pneu, 2h pour révision).
 *   - capacité = nb postes atelier × créneaux. Pas "couverts".
 */
export const GARAGE_PROFILE: IndustryProfile = {
  industry: "garage",
  displayName: "Garage auto",
  terms: {
    booking: "rendez-vous",
    customer: "client",
    partyUnit: null,
  },
  fields: [
    {
      key: "serviceType",
      question: "Quelle prestation ? (vidange, révision, contrôle technique, pneus, autre)",
      acknowledgement: "Bien noté.",
      required: true,
    },
    {
      key: "vehiclePlate",
      question: "Quelle est l'immatriculation du véhicule ?",
      acknowledgement: "Merci.",
      required: true,
    },
    {
      key: "date",
      question: "Pour quel jour souhaitez-vous le rendez-vous ?",
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
      question: "Votre numéro pour vous rappeler quand le véhicule est prêt ?",
      acknowledgement: "C'est bon.",
      required: true,
    },
    {
      key: "notes",
      question: "Un détail particulier sur le problème ou le véhicule ?",
      acknowledgement: "Noté.",
      required: false,
    },
  ],
  prompt: {
    role: "Tu es l'assistant de prise de rendez-vous du garage {restaurantName}.",
    mission:
      "Aider le client à prendre, modifier ou annuler un rendez-vous atelier (mécanique, carrosserie, pneus, contrôle technique).",
    domainRules:
      "Toujours demander la prestation AVANT la date : la durée du créneau atelier en dépend.\n" +
      "L'immatriculation est obligatoire — sert d'identifiant pour retrouver l'historique du véhicule.\n" +
      "Capacité = postes atelier disponibles. Toujours passer par check_availability.\n" +
      "Jamais proposer un devis ou un diagnostic — c'est le mécanicien qui décide à l'arrivée.\n" +
      "Si le client décrit une panne, l'orienter vers un créneau diagnostic court (30 min) plutôt qu'une intervention longue.",
    examples:
      "User: « Je voudrais une révision sur ma Clio jeudi matin »\n" +
      "→ demander immatriculation, puis check_availability(serviceType=révision, date=jeudi, time=10:00).\n\n" +
      "User: « Ma voiture fait un bruit bizarre, je peux passer demain ? »\n" +
      "→ proposer un créneau diagnostic court, demander immatriculation, ne PAS deviner la panne.\n\n" +
      "User: « Annule mon RDV du 12 »\n" +
      "→ cancel_reservation avec téléphone OU immatriculation + date.",
  },
  defaults: {
    bookingDurationMinutes: 60,
    bufferMinutes: 15,
  },
};
