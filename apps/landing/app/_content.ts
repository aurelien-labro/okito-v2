export type Lang = "fr" | "en";

export interface LandingContent {
  nav: { features: string; how: string; pricing: string; faq: string; trial: string; demo: string };
  hero: {
    badge: string;
    titleLead: string;
    titleAccent: string;
    subtitle: string;
    ctaDemo: string;
    ctaHow: string;
    reassurance: string;
  };
  proof: { tagline: string; stats: { value: string; label: string }[] };
  features: { heading: string; headingAccent: string; items: { title: string; body: string }[] };
  how: { heading: string; subtitle: string; steps: { n: string; title: string; body: string }[] };
  verticals: { heading: string; subtitle: string; items: { emoji: string; label: string }[] };
  pricing: {
    heading: string;
    subtitle: string;
    perMonth: string;
    plans: {
      name: string;
      price: string;
      period: string;
      tag: string | null;
      features: string[];
      cta: string;
    }[];
  };
  faq: { heading: string; items: { q: string; a: string }[] };
  cta: { heading: string; subtitle: string; button: string; note: string };
  footer: { rights: string; legal: string; privacy: string; contact: string };
}

const fr: LandingContent = {
  nav: {
    features: "Fonctionnalités",
    how: "Comment ça marche",
    pricing: "Tarifs",
    faq: "FAQ",
    trial: "Essai gratuit",
    demo: "Demander une démo",
  },
  hero: {
    badge: "En production · agents IA voix & WhatsApp",
    titleLead: "L'IA qui prend vos réservations",
    titleAccent: "24h/24, à votre place.",
    subtitle:
      "Vos clients appellent, WhatsAppent, cliquent sur votre widget. OKITO répond, comprend, confirme et note la résa dans votre agenda. Vous récupérez le temps perdu au téléphone.",
    ctaDemo: "Demander une démo",
    ctaHow: "Voir comment ça marche",
    reassurance: "Sans engagement · Mise en route en 24h · Vos données restent en Europe.",
  },
  proof: {
    tagline: "Pensé pour la restauration, hôtellerie, garages, salons, services à booking",
    stats: [
      { value: "< 2s", label: "Réponse vocale" },
      { value: "24/7", label: "Disponibilité" },
      { value: "-80%", label: "Appels manqués" },
      { value: "FR · EN · ES", label: "Multilingue" },
    ],
  },
  features: {
    heading: "Tout ce qu'un·e bon·ne réceptionniste fait.",
    headingAccent: "Sans pauses, sans absences, sans rage du vendredi soir.",
    items: [
      {
        title: "Voix naturelle",
        body: "L'agent parle comme un employé qui connaît votre maison. Pas de répondeur, pas de 'appuyez sur 1'. Une vraie conversation.",
      },
      {
        title: "WhatsApp natif",
        body: "Vos clients vous écrivent au numéro pro habituel. OKITO répond, propose des créneaux, confirme. Vous récupérez l'historique dans le dashboard.",
      },
      {
        title: "Widget web 1 ligne",
        body: "Copiez le script sur votre site. Bouton de chat aux couleurs de votre marque. Pas de redirection, le client reste chez vous.",
      },
      {
        title: "Liste d'attente intelligente",
        body: "Quand un créneau est plein, le bot propose la liste d'attente. Annulation → notification automatique au prochain client.",
      },
      {
        title: "Inventaire de ressources",
        body: "Définissez vos tables, chambres, ponts ou fauteuils. OKITO sélectionne la plus petite ressource qui passe. Vous n'optimisez plus à la main.",
      },
      {
        title: "Fidélité automatique",
        body: "À partir de 3 visites, l'agent reconnaît votre habitué·e par son téléphone et adapte son accueil. Naturel, pas commercial.",
      },
      {
        title: "Rappels J-1",
        body: "Le matin, OKITO envoie un rappel personnalisé par email ou WhatsApp à chaque résa du jour. Le no-show s'effondre.",
      },
      {
        title: "Acomptes anti no-show",
        body: "Pour les grandes tablées ou les événements, demande de carte au moment de la résa. Garanti par Stripe.",
      },
    ],
  },
  how: {
    heading: "Comment ça marche",
    subtitle: "Pas de setup à rallonge. Pas d'intégration douloureuse. On s'occupe de tout.",
    steps: [
      {
        n: "01",
        title: "On vous connecte en 24h",
        body: "Numéro vocal dédié + numéro WhatsApp Business + snippet à coller sur votre site. On configure vos horaires, vos ressources et votre ton.",
      },
      {
        n: "02",
        title: "OKITO répond, vous regardez",
        body: "Chaque conversation est tracée dans le dashboard. Vous voyez ce qui s'est dit, les résas créées, les annulations. Reprise en main à 1 clic.",
      },
      {
        n: "03",
        title: "Vous gardez le contrôle",
        body: "Synchronisation vers votre agenda existant (ou notre tableau résa). Filtres par jour, recherche par téléphone, édition manuelle.",
      },
    ],
  },
  verticals: {
    heading: "Vertical-agnostique.",
    subtitle:
      "Le moteur s'adapte au vocabulaire et aux règles de votre métier. Un même compte, plusieurs établissements.",
    items: [
      { emoji: "🍽️", label: "Restaurants" },
      { emoji: "🏨", label: "Hôtels" },
      { emoji: "💇", label: "Salons / spa" },
      { emoji: "🚗", label: "Garages" },
      { emoji: "🏡", label: "Locations courte durée" },
      { emoji: "📅", label: "Tout métier à booking" },
    ],
  },
  pricing: {
    heading: "Tarifs simples",
    subtitle: "Sans engagement. Premier mois gratuit. Annulable à tout moment.",
    perMonth: "/ mois",
    plans: [
      {
        name: "Essentiel",
        price: "39 €",
        period: "/ mois",
        tag: null,
        features: [
          "Widget web embarqué",
          "Bot WhatsApp",
          "Jusqu'à 200 résas / mois",
          "Dashboard temps réel",
          "Rappels J-1 email",
          "Setup inclus",
        ],
        cta: "Commencer",
      },
      {
        name: "Pro",
        price: "69 €",
        period: "/ mois",
        tag: "Le plus populaire",
        features: [
          "Tout l'Essentiel",
          "Agent vocal Vapi",
          "WhatsApp + SMS rappels",
          "Inventaire de ressources",
          "Liste d'attente automatique",
          "Programme fidélité",
          "Acomptes Stripe inclus",
          "Volume résas illimité",
        ],
        cta: "Demander une démo",
      },
      {
        name: "Multi-établissements",
        price: "Sur devis",
        period: "",
        tag: null,
        features: [
          "Tout le Pro",
          "Plusieurs tenants",
          "Rôles & équipes",
          "API access",
          "SLA dédié",
          "On-prem possible",
        ],
        cta: "Nous contacter",
      },
    ],
  },
  faq: {
    heading: "FAQ",
    items: [
      {
        q: "Mes clients vont s'apercevoir que ce n'est pas un humain ?",
        a: "Si vous leur demandez, oui — on ne ment pas. Mais le ton, les hésitations, les acknowledgments font que dans 95% des cas ils raccrochent en pensant avoir parlé à votre réceptionniste.",
      },
      {
        q: "Et si OKITO se trompe ?",
        a: "Vous voyez chaque conversation dans le dashboard. Annulation ou édition manuelle à 1 clic. Les cas limites (groupes > 20, demandes spéciales) sont redirigés vers vous automatiquement.",
      },
      {
        q: "Mes données ?",
        a: "Stockées en Europe (Supabase Paris). RGPD. Vous restez propriétaire. Export à tout moment, suppression sur demande.",
      },
      {
        q: "Compatible avec mon logiciel actuel ?",
        a: "On synchronise avec les agendas type Google Calendar / Outlook. Pour TheFork / OpenTable / GuestOnline, on étudie sur demande.",
      },
      {
        q: "Combien de temps pour démarrer ?",
        a: "24h en moyenne. On configure votre ligne, vos horaires, vos ressources. Vous validez quelques messages-types et c'est en route.",
      },
    ],
  },
  cta: {
    heading: "Reprenez votre soirée.",
    subtitle:
      "15 minutes de démo. Une simulation sur votre vraie ligne. Vous voyez si ça tient ou pas.",
    button: "Demander une démo",
    note: "hello@okito.app — réponse sous 24h ouvrées",
  },
  footer: {
    rights: "Tous droits réservés.",
    legal: "Mentions légales",
    privacy: "Confidentialité",
    contact: "Contact",
  },
};

const en: LandingContent = {
  nav: {
    features: "Features",
    how: "How it works",
    pricing: "Pricing",
    faq: "FAQ",
    trial: "Free trial",
    demo: "Book a demo",
  },
  hero: {
    badge: "Live · voice & WhatsApp AI agents",
    titleLead: "The AI that takes your bookings",
    titleAccent: "24/7, in your place.",
    subtitle:
      "Your customers call, WhatsApp you, click your widget. OKITO answers, understands, confirms and logs the booking in your calendar. You get back the time lost on the phone.",
    ctaDemo: "Book a demo",
    ctaHow: "See how it works",
    reassurance: "No commitment · Live in 24h · Your data stays in Europe.",
  },
  proof: {
    tagline: "Built for restaurants, hotels, garages, salons, any booking-based service",
    stats: [
      { value: "< 2s", label: "Voice response" },
      { value: "24/7", label: "Availability" },
      { value: "-80%", label: "Missed calls" },
      { value: "FR · EN · ES", label: "Multilingual" },
    ],
  },
  features: {
    heading: "Everything a great receptionist does.",
    headingAccent: "No breaks, no absences, no Friday-night meltdown.",
    items: [
      {
        title: "Natural voice",
        body: "The agent speaks like an employee who knows your business. No voicemail, no 'press 1'. A real conversation.",
      },
      {
        title: "Native WhatsApp",
        body: "Customers write to your usual business number. OKITO replies, offers slots, confirms. You get the history in the dashboard.",
      },
      {
        title: "One-line web widget",
        body: "Paste the script on your site. A chat button in your brand colors. No redirect — the customer stays with you.",
      },
      {
        title: "Smart waitlist",
        body: "When a slot is full, the bot offers the waitlist. On cancellation → automatic notification to the next customer.",
      },
      {
        title: "Resource inventory",
        body: "Define your tables, rooms, lifts or chairs. OKITO picks the smallest resource that fits. No more manual optimizing.",
      },
      {
        title: "Automatic loyalty",
        body: "From the 3rd visit, the agent recognizes your regular by their phone number and adapts its welcome. Natural, not salesy.",
      },
      {
        title: "Day-before reminders",
        body: "Each morning, OKITO sends a personalized reminder by email or WhatsApp for every booking of the day. No-shows collapse.",
      },
      {
        title: "Anti no-show deposits",
        body: "For large parties or events, request a card at booking time. Backed by Stripe.",
      },
    ],
  },
  how: {
    heading: "How it works",
    subtitle: "No endless setup. No painful integration. We handle everything.",
    steps: [
      {
        n: "01",
        title: "We connect you in 24h",
        body: "Dedicated voice number + WhatsApp Business number + snippet to paste on your site. We configure your hours, resources and tone.",
      },
      {
        n: "02",
        title: "OKITO answers, you watch",
        body: "Every conversation is tracked in the dashboard. You see what was said, bookings created, cancellations. Take over in 1 click.",
      },
      {
        n: "03",
        title: "You stay in control",
        body: "Sync to your existing calendar (or our booking board). Filter by day, search by phone, edit manually.",
      },
    ],
  },
  verticals: {
    heading: "Vertical-agnostic.",
    subtitle:
      "The engine adapts to the vocabulary and rules of your trade. One account, multiple locations.",
    items: [
      { emoji: "🍽️", label: "Restaurants" },
      { emoji: "🏨", label: "Hotels" },
      { emoji: "💇", label: "Salons / spa" },
      { emoji: "🚗", label: "Garages" },
      { emoji: "🏡", label: "Short-term rentals" },
      { emoji: "📅", label: "Any booking business" },
    ],
  },
  pricing: {
    heading: "Simple pricing",
    subtitle: "No commitment. First month free. Cancel anytime.",
    perMonth: "/ month",
    plans: [
      {
        name: "Essential",
        price: "€39",
        period: "/ month",
        tag: null,
        features: [
          "Embedded web widget",
          "WhatsApp bot",
          "Up to 200 bookings / month",
          "Real-time dashboard",
          "Day-before email reminders",
          "Setup included",
        ],
        cta: "Get started",
      },
      {
        name: "Pro",
        price: "€69",
        period: "/ month",
        tag: "Most popular",
        features: [
          "Everything in Essential",
          "Vapi voice agent",
          "WhatsApp + SMS reminders",
          "Resource inventory",
          "Automatic waitlist",
          "Loyalty program",
          "Stripe deposits included",
          "Unlimited bookings",
        ],
        cta: "Book a demo",
      },
      {
        name: "Multi-location",
        price: "Custom",
        period: "",
        tag: null,
        features: [
          "Everything in Pro",
          "Multiple tenants",
          "Roles & teams",
          "API access",
          "Dedicated SLA",
          "On-prem available",
        ],
        cta: "Contact us",
      },
    ],
  },
  faq: {
    heading: "FAQ",
    items: [
      {
        q: "Will my customers realize it's not a human?",
        a: "If they ask, yes — we don't lie. But the tone, the hesitations, the acknowledgments mean that in 95% of cases they hang up thinking they spoke to your receptionist.",
      },
      {
        q: "What if OKITO gets it wrong?",
        a: "You see every conversation in the dashboard. Cancel or edit manually in 1 click. Edge cases (groups > 20, special requests) are redirected to you automatically.",
      },
      {
        q: "What about my data?",
        a: "Stored in Europe (Supabase Paris). GDPR. You stay the owner. Export anytime, deletion on request.",
      },
      {
        q: "Compatible with my current software?",
        a: "We sync with calendars like Google Calendar / Outlook. For TheFork / OpenTable / GuestOnline, we assess on request.",
      },
      {
        q: "How long to get started?",
        a: "24h on average. We configure your line, hours and resources. You approve a few sample messages and you're live.",
      },
    ],
  },
  cta: {
    heading: "Take back your evening.",
    subtitle: "15-minute demo. A simulation on your real line. You decide if it holds up.",
    button: "Book a demo",
    note: "hello@okito.app — reply within 1 business day",
  },
  footer: {
    rights: "All rights reserved.",
    legal: "Legal notice",
    privacy: "Privacy",
    contact: "Contact",
  },
};

export const CONTENT: Record<Lang, LandingContent> = { fr, en };

export function resolveLang(raw: string | string[] | undefined): Lang {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "en" ? "en" : "fr";
}
