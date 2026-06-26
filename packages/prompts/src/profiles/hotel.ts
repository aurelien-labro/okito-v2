import type { IndustryProfile } from "./types.js";

/**
 * Profil "hôtel" — couvre hôtels, gîtes, chambres d'hôtes, locations courtes.
 *
 * Pattern fondamentalement différent du resto/coiffeur :
 *   - "réservation" = **séjour multi-nuits** (checkInDate ≠ checkOutDate)
 *   - dispo = ensemble de nuits consécutives (pas un créneau)
 *   - distinction adultes / enfants pour le tarif
 *   - email obligatoire (séjour = transaction plus formelle, confirmation
 *     écrite attendue)
 *
 * Sert de **test de généralité** de l'interface IndustryProfile : si elle
 * encaisse à la fois resto (créneau 2h) et hôtel (séjour N nuits) sans
 * adaptation du ChatService, l'abstraction tient.
 */
export const HOTEL_PROFILE: IndustryProfile = {
  industry: "hotel",
  displayName: "Hôtel & gîtes",
  terms: {
    booking: "réservation",
    customer: "client",
    partyUnit: "occupants",
  },
  fields: [
    {
      key: "checkInDate",
      question: "Pour quelle date d'arrivée ?",
      acknowledgement: "C'est noté.",
      required: true,
    },
    {
      key: "checkOutDate",
      question: "Et quelle date de départ ?",
      acknowledgement: "Très bien.",
      required: true,
    },
    {
      key: "adultsCount",
      question: "Combien d'adultes seront du séjour ?",
      acknowledgement: "Parfait.",
      required: true,
    },
    {
      key: "childrenCount",
      question: "Et combien d'enfants, le cas échéant ?",
      acknowledgement: "C'est bon.",
      required: false,
    },
    {
      key: "customerName",
      question: "À quel nom faire la réservation ?",
      acknowledgement: "Merci.",
      required: true,
    },
    {
      key: "customerPhone",
      question: "Un numéro de téléphone, pour pouvoir vous joindre ?",
      acknowledgement: "C'est noté.",
      required: true,
    },
    {
      key: "customerEmail",
      question: "Et une adresse email pour la confirmation écrite ?",
      acknowledgement: "Très bien.",
      required: true,
    },
    {
      key: "notes",
      question: "Une demande particulière (étage, lit bébé, vue) ?",
      acknowledgement: "Bien noté.",
      required: false,
    },
  ],
  prompt: {
    role: "Tu es l'assistant de réservation de l'hôtel {restaurantName}.",
    mission: "Aider le client à réserver, modifier ou annuler un séjour (1 à N nuits) à l'hôtel.",
    domainRules:
      "Un séjour va de checkInDate à checkOutDate exclus : 15→17 août = 2 nuits.\n" +
      "checkInDate doit être STRICTEMENT antérieure à checkOutDate.\n" +
      "Toujours vérifier la dispo des chambres pour TOUTE la période, pas juste la 1ère nuit.\n" +
      "Distinguer adultsCount et childrenCount : le tarif et la capacité chambre en dépendent.\n" +
      "Email obligatoire : la confirmation de séjour est attendue par écrit.\n" +
      "Pour annuler ou modifier, retrouver via téléphone + dates du séjour.\n" +
      "Jamais inventer une disponibilité ni un tarif.",
    examples:
      "User: « Une chambre du 15 au 17 août pour 2 personnes »\n" +
      "→ check_availability(checkInDate=2026-08-15, checkOutDate=2026-08-17, adults=2) puis confirmation.\n\n" +
      "User: « On viendrait 3 nuits début septembre, 2 adultes 1 enfant »\n" +
      "→ demander la date d'arrivée précise (« début septembre » ambigu), puis dériver checkOutDate.\n\n" +
      "User: « Annule ma résa du 15 août »\n" +
      "→ cancel_reservation avec téléphone + checkInDate.",
  },
  defaults: {
    // Hôtel = booking en nuits, pas en minutes. Le champ existe pour le contrat
    // IndustryProfile mais n'est pas utilisé par le ChatService dans ce vertical.
    bookingDurationMinutes: 1440,
    bufferMinutes: 0,
  },
};
