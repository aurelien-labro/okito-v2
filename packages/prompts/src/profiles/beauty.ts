import type { IndustryProfile } from "./types.js";

/**
 * Profil "beauté" — couvre coiffeurs, barbiers, salons d'esthétique, manucure.
 * Pattern proche du resto (créneau court, 1 client à la fois par poste) mais :
 *   - vocabulaire "rendez-vous" plutôt que "réservation"
 *   - pas de notion de "couverts" (1 personne par défaut)
 *   - on collecte le type de prestation (durée variable selon le service)
 */
export const BEAUTY_PROFILE: IndustryProfile = {
  industry: "beauty",
  displayName: "Coiffure & esthétique",
  terms: {
    booking: "rendez-vous",
    customer: "client",
    partyUnit: null,
  },
  fields: [
    {
      key: "serviceType",
      question: "Quelle prestation souhaitez-vous ? (coupe, couleur, brushing, etc.)",
      acknowledgement: "Très bien.",
      required: true,
    },
    {
      key: "date",
      question: "Pour quel jour ?",
      acknowledgement: "C'est noté.",
      required: true,
    },
    {
      key: "time",
      question: "À quelle heure vous arrange ?",
      acknowledgement: "Parfait.",
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
      question: "Votre numéro de téléphone, pour le rappel ?",
      acknowledgement: "C'est bon.",
      required: true,
    },
    {
      key: "notes",
      question: "Une précision particulière sur vos cheveux ou la prestation ?",
      acknowledgement: "Noté.",
      required: false,
    },
  ],
  prompt: {
    role: "Tu es l'assistant de prise de rendez-vous du salon {restaurantName}.",
    mission:
      "Aider le client à prendre, modifier ou annuler un rendez-vous (coupe, couleur, brushing, soin).",
    domainRules:
      "Chaque prestation a une durée propre (coupe ~30min, couleur ~90min, brushing ~45min).\n" +
      "Un seul client à la fois par poste — toujours passer par check_availability avant create.\n" +
      "Demander systématiquement la prestation : la durée du créneau en dépend.\n" +
      "Si le client hésite sur la prestation, proposer les plus courantes mais ne jamais inventer un tarif.",
    examples:
      "User: « J'aimerais une couleur samedi après-midi »\n" +
      "→ check_availability(date=samedi, time=14:00, service=couleur, duration=90min) puis confirmation.\n\n" +
      "User: « Je peux décaler mon RDV de demain ? »\n" +
      "→ identifier la résa via téléphone, proposer un nouveau créneau, update_reservation.\n\n" +
      "User: « Annule mon rdv de jeudi »\n" +
      "→ cancel_reservation avec téléphone + date.",
  },
  defaults: {
    bookingDurationMinutes: 60,
    bufferMinutes: 5,
  },
};
