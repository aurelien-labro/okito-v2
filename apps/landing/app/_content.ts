export type Lang = "fr" | "en";

export interface DemoStep {
  delay: number;
  kind: "system" | "customer" | "jarvis" | "owner";
  who?: string;
  stars?: string;
  html: string;
  chips?: { label: string; tone?: "warn" | "good"; countdown?: number }[];
}

export interface LandingContent {
  nav: { skills: string; how: string; pricing: string; faq: string; login: string; cta: string };
  hero: {
    eyebrow: string;
    titleLead: string;
    titleEm: string;
    titleTail: string;
    ledeHtml: string;
    ctaPrimary: string;
    ctaSecondary: string;
    note: string;
    integrations: string[];
  };
  demo: {
    title: string;
    titleBold: string;
    footIdle: string;
    footRunning: string;
    footDone: string;
    replay: string;
    sent: string;
    countdownPrefix: string;
    steps: DemoStep[];
  };
  skills: {
    kicker: string;
    heading: string;
    sub: string;
    items: { num: string; title: string; body: string; loopHtml: string }[];
  };
  how: {
    kicker: string;
    heading: string;
    sub: string;
    steps: { n: string; title: string; body: string }[];
  };
  pricing: {
    kicker: string;
    heading: string;
    sub: string;
    plans: {
      name: string;
      amount: string;
      period: string;
      tag: string | null;
      features: string[];
      cta: string;
      featured: boolean;
    }[];
  };
  faq: { kicker: string; heading: string; sub: string; items: { q: string; a: string }[] };
  footer: {
    tagline: string;
    product: string;
    resources: string;
    contact: string;
    status: string;
    changelog: string;
    legal: string;
    privacy: string;
    rights: string;
  };
}

const fr: LandingContent = {
  nav: {
    skills: "Skills",
    how: "Comment ça marche",
    pricing: "Tarifs",
    faq: "FAQ",
    login: "Se connecter",
    cta: "Essayer OKITO",
  },
  hero: {
    eyebrow: "Jarvis · copilote autonome",
    titleLead: "Votre commerce tourne. ",
    titleEm: "Jarvis",
    titleTail: " s'occupe du reste.",
    ledeHtml:
      "OKITO lit vos avis, vos e-mails et vos factures. Il rédige la réponse, prépare la relance, extrait la facture fournisseur — et <b>vous laisse 24 h pour annuler</b> avant d'agir. Rien ne part sans que vous puissiez dire non.",
    ctaPrimary: "Démarrer gratuitement",
    ctaSecondary: "Voir comment ça marche",
    note: "Sans carte bancaire · 14 jours",
    integrations: ["Gmail", "Outlook", "IMAP", "Google Business", "Stripe"],
  },
  demo: {
    title: "jarvis · ",
    titleBold: "fil du jour",
    footIdle: "Simulation temps réel · 3 boucles",
    footRunning: "Simulation en cours…",
    footDone: "3 boucles proposées · 0 envoi automatique sans votre accord",
    replay: "Rejouer",
    sent: "Envoyé",
    countdownPrefix: "Envoi dans",
    steps: [
      {
        delay: 200,
        kind: "system",
        html: "08:12 — nouvel événement <b>review.submitted</b> · Google Business",
      },
      {
        delay: 900,
        kind: "customer",
        who: "Léa M. · 2★",
        stars: "★★",
        html: "Service correct mais l'attente à midi est vraiment longue. Dommage, la cuisine est bonne.",
      },
      {
        delay: 1800,
        kind: "jarvis",
        who: "Jarvis · réponse proposée",
        html: "Bonjour Léa, merci pour votre retour. L'attente du midi est un vrai sujet chez nous en ce moment — nous testons un service en deux temps dès la semaine prochaine. Nous serions ravis de vous revoir pour vous montrer le changement.",
        chips: [{ label: "", tone: "warn", countdown: 6 }, { label: "Annuler" }],
      },
      {
        delay: 8200,
        kind: "system",
        html: "10:04 — <b>invoice.overdue</b> · facture 2026-0184 · 1&nbsp;240&nbsp;€",
      },
      {
        delay: 9000,
        kind: "jarvis",
        who: "Jarvis · relance préparée",
        html: "Je propose un e-mail de relance à <b>Traiteur Bellini</b> pour la facture <b>2026-0184</b> échue depuis 6 jours. Ton cordial, montant rappelé, lien de paiement inclus.",
        chips: [{ label: "", tone: "warn", countdown: 5 }, { label: "Voir le brouillon" }],
      },
      {
        delay: 15200,
        kind: "system",
        html: "14:37 — pièce jointe PDF détectée · fournisseur METRO",
      },
      {
        delay: 16000,
        kind: "jarvis",
        who: "Jarvis · facture fournisseur extraite",
        html: "Facture <b>METRO — 847,20&nbsp;€ TTC</b> (dont TVA 5,5&nbsp;% : 44,20&nbsp;€), échéance <b>31/07</b>. Je prépare un rappel de paiement pour le 28/07.",
        chips: [{ label: "Extraction · confiance 96 %", tone: "good" }, { label: "Modifier" }],
      },
      {
        delay: 21000,
        kind: "owner",
        who: "Vous",
        html: "Parfait, laisse tourner.",
      },
    ],
  },
  skills: {
    kicker: "Skills",
    heading: "Trois boucles fermées, tout de suite.",
    sub: "Chaque skill est une boucle complète : Jarvis observe un signal du bus d'événements, propose une action, attend 24 h, puis l'exécute — ou l'annule si vous cliquez.",
    items: [
      {
        num: "Skill 01",
        title: "Réponse aux avis clients",
        body: "Un avis ≤ 3★ arrive. Jarvis rédige une réponse vouvoyée, sans promesse chiffrée, prête à envoyer.",
        loopHtml:
          "observer · <b>review.submitted</b> → propose <b>review.reply</b> → 24&nbsp;h → envoi",
      },
      {
        num: "Skill 02",
        title: "Relance de factures",
        body: "Une facture passe en retard. Jarvis prépare la relance client par e-mail, avec le bon ton et le bon montant.",
        loopHtml:
          "cron · <b>invoice.overdue</b> → propose <b>invoice.remind</b> → 24&nbsp;h → envoi",
      },
      {
        num: "Skill 03",
        title: "Factures fournisseurs",
        body: "Un PDF arrive dans l'inbox. Jarvis extrait montant, TVA, échéance, et rappelle J-3 avant l'échéance.",
        loopHtml: "upload · extraction LLM → <b>supplier_invoice.dueSoon</b> → rappel J-3",
      },
    ],
  },
  how: {
    kicker: "Comment ça marche",
    heading: "Un bus d'événements, un garde-fou, un journal.",
    sub: "Rien de magique : chaque signal métier passe par un bus interne. Jarvis y écoute, propose, attend, agit. Vous voyez tout, vous pouvez tout annuler.",
    steps: [
      {
        n: "Étape 01",
        title: "Vous connectez vos comptes",
        body: "Gmail, Outlook, IMAP, Google Business, Stripe. OAuth chiffré, aucune fuite de token.",
      },
      {
        n: "Étape 02",
        title: "Le bus capte les événements",
        body: "Avis reçus, e-mails, factures, visites du site — tout devient un événement horodaté.",
      },
      {
        n: "Étape 03",
        title: "Jarvis propose une action",
        body: "Rédaction LLM, calcul, préparation. L'action apparaît dans votre fil avec un compte à rebours de 24 h.",
      },
      {
        n: "Étape 04",
        title: "Vous annulez ou vous laissez faire",
        body: "Un clic pour annuler. Sinon, Jarvis exécute — envoi, relance, mise à jour. Chaque geste est tracé.",
      },
    ],
  },
  pricing: {
    kicker: "Tarifs",
    heading: "Simple. Un plan, un compte, un commerce.",
    sub: "Démarrez gratuitement. Passez à Pro quand une boucle vous a fait gagner une heure. Sans engagement, résiliable en un clic depuis le dashboard.",
    plans: [
      {
        name: "Starter",
        amount: "0 €",
        period: "/ mois",
        tag: null,
        featured: false,
        features: [
          "1 boîte e-mail connectée",
          "Boucle avis clients",
          "Historique 30 jours",
          "Support communauté",
        ],
        cta: "Commencer",
      },
      {
        name: "Pro",
        amount: "49 €",
        period: "/ mois",
        tag: "Recommandé",
        featured: true,
        features: [
          "3 boîtes + Google Business",
          "Les 3 boucles autonomes",
          "Brief matinal WhatsApp",
          "Chat vocal avec Jarvis",
          "Historique 12 mois",
        ],
        cta: "Essayer 14 jours gratuits",
      },
      {
        name: "Scale",
        amount: "129 €",
        period: "/ mois",
        tag: null,
        featured: false,
        features: [
          "Multi-établissements",
          "Marketplace de connecteurs",
          "Préparation TVA export",
          "Support prioritaire",
        ],
        cta: "Nous contacter",
      },
    ],
  },
  faq: {
    kicker: "FAQ",
    heading: "Ce que vous voulez savoir avant.",
    sub: "Trois questions reviennent tout le temps. Voici les vraies réponses, sans langue de bois.",
    items: [
      {
        q: "Jarvis peut-il envoyer un e-mail sans que je le voie ?",
        a: "Non. Chaque action passe par une fenêtre de 24 h annulable, affichée dans votre fil. Un compte à rebours court en clair. Un clic sur « Annuler » stoppe l'action définitivement. Vous pouvez aussi passer une skill en mode approbation manuelle : rien ne part sans votre clic.",
      },
      {
        q: "Que se passe-t-il pour mes données ?",
        a: "Tokens OAuth chiffrés côté serveur avec AES-256-GCM. Les pièces jointes utilisées pour l'extraction ne sont jamais stockées. Aucun modèle tiers n'est entraîné sur vos données. Vous pouvez exporter puis supprimer votre compte en une action.",
      },
      {
        q: "Combien de temps pour être opérationnel ?",
        a: "Environ 10 minutes : connexion Gmail, connexion Google Business, choix des skills à activer. Le premier brief matinal arrive le lendemain à 8 h. La première boucle se déclenche dès qu'un événement métier arrive.",
      },
    ],
  },
  footer: {
    tagline: "Le copilote autonome des commerces qui n'ont pas d'assistant.",
    product: "Produit",
    resources: "Ressources",
    contact: "Contact",
    status: "Statut",
    changelog: "Changelog",
    legal: "Mentions légales",
    privacy: "Confidentialité",
    rights: "© 2026 OKITO — Paris",
  },
};

const en: LandingContent = {
  nav: {
    skills: "Skills",
    how: "How it works",
    pricing: "Pricing",
    faq: "FAQ",
    login: "Sign in",
    cta: "Try OKITO",
  },
  hero: {
    eyebrow: "Jarvis · autonomous copilot",
    titleLead: "Your business runs. ",
    titleEm: "Jarvis",
    titleTail: " handles the rest.",
    ledeHtml:
      "OKITO reads your reviews, emails and invoices. It drafts the reply, prepares the reminder, extracts the supplier invoice — and <b>gives you 24 h to cancel</b> before acting. Nothing goes out without you being able to say no.",
    ctaPrimary: "Start for free",
    ctaSecondary: "See how it works",
    note: "No credit card · 14 days",
    integrations: ["Gmail", "Outlook", "IMAP", "Google Business", "Stripe"],
  },
  demo: {
    title: "jarvis · ",
    titleBold: "today's feed",
    footIdle: "Real-time simulation · 3 loops",
    footRunning: "Simulation running…",
    footDone: "3 loops proposed · 0 automatic sends without your approval",
    replay: "Replay",
    sent: "Sent",
    countdownPrefix: "Sending in",
    steps: [
      {
        delay: 200,
        kind: "system",
        html: "08:12 — new event <b>review.submitted</b> · Google Business",
      },
      {
        delay: 900,
        kind: "customer",
        who: "Léa M. · 2★",
        stars: "★★",
        html: "Decent service but the lunch wait is really long. A shame, the food is good.",
      },
      {
        delay: 1800,
        kind: "jarvis",
        who: "Jarvis · proposed reply",
        html: "Hello Léa, thank you for your feedback. The lunch wait is a real issue for us right now — we are testing a two-stage service starting next week. We would love to see you again to show you the change.",
        chips: [{ label: "", tone: "warn", countdown: 6 }, { label: "Cancel" }],
      },
      {
        delay: 8200,
        kind: "system",
        html: "10:04 — <b>invoice.overdue</b> · invoice 2026-0184 · €1,240",
      },
      {
        delay: 9000,
        kind: "jarvis",
        who: "Jarvis · reminder prepared",
        html: "I suggest a reminder email to <b>Traiteur Bellini</b> for invoice <b>2026-0184</b>, 6 days overdue. Friendly tone, amount restated, payment link included.",
        chips: [{ label: "", tone: "warn", countdown: 5 }, { label: "View draft" }],
      },
      {
        delay: 15200,
        kind: "system",
        html: "14:37 — PDF attachment detected · supplier METRO",
      },
      {
        delay: 16000,
        kind: "jarvis",
        who: "Jarvis · supplier invoice extracted",
        html: "Invoice <b>METRO — €847.20 incl. tax</b> (VAT 5.5%: €44.20), due <b>07/31</b>. I'm scheduling a payment reminder for 07/28.",
        chips: [{ label: "Extraction · 96% confidence", tone: "good" }, { label: "Edit" }],
      },
      {
        delay: 21000,
        kind: "owner",
        who: "You",
        html: "Perfect, keep it running.",
      },
    ],
  },
  skills: {
    kicker: "Skills",
    heading: "Three closed loops, right away.",
    sub: "Each skill is a complete loop: Jarvis watches a signal on the event bus, proposes an action, waits 24 h, then executes it — or cancels it if you click.",
    items: [
      {
        num: "Skill 01",
        title: "Review replies",
        body: "A ≤ 3★ review arrives. Jarvis drafts a polite reply, no numeric promises, ready to send.",
        loopHtml:
          "observe · <b>review.submitted</b> → proposes <b>review.reply</b> → 24&nbsp;h → send",
      },
      {
        num: "Skill 02",
        title: "Invoice reminders",
        body: "An invoice goes overdue. Jarvis prepares the customer reminder email, with the right tone and the right amount.",
        loopHtml:
          "cron · <b>invoice.overdue</b> → proposes <b>invoice.remind</b> → 24&nbsp;h → send",
      },
      {
        num: "Skill 03",
        title: "Supplier invoices",
        body: "A PDF lands in the inbox. Jarvis extracts amount, VAT, due date, and reminds you 3 days before it's due.",
        loopHtml: "upload · LLM extraction → <b>supplier_invoice.dueSoon</b> → D-3 reminder",
      },
    ],
  },
  how: {
    kicker: "How it works",
    heading: "An event bus, a safeguard, a journal.",
    sub: "Nothing magic: every business signal goes through an internal bus. Jarvis listens, proposes, waits, acts. You see everything, you can cancel everything.",
    steps: [
      {
        n: "Step 01",
        title: "You connect your accounts",
        body: "Gmail, Outlook, IMAP, Google Business, Stripe. Encrypted OAuth, no token leaks.",
      },
      {
        n: "Step 02",
        title: "The bus captures events",
        body: "Reviews, emails, invoices, site visits — everything becomes a timestamped event.",
      },
      {
        n: "Step 03",
        title: "Jarvis proposes an action",
        body: "LLM drafting, computation, preparation. The action appears in your feed with a 24 h countdown.",
      },
      {
        n: "Step 04",
        title: "You cancel or let it run",
        body: "One click to cancel. Otherwise, Jarvis executes — send, remind, update. Every move is logged.",
      },
    ],
  },
  pricing: {
    kicker: "Pricing",
    heading: "Simple. One plan, one account, one business.",
    sub: "Start for free. Upgrade to Pro once a loop has saved you an hour. No commitment, cancel in one click from the dashboard.",
    plans: [
      {
        name: "Starter",
        amount: "€0",
        period: "/ month",
        tag: null,
        featured: false,
        features: ["1 connected mailbox", "Review loop", "30-day history", "Community support"],
        cta: "Get started",
      },
      {
        name: "Pro",
        amount: "€49",
        period: "/ month",
        tag: "Recommended",
        featured: true,
        features: [
          "3 mailboxes + Google Business",
          "All 3 autonomous loops",
          "Morning WhatsApp brief",
          "Voice chat with Jarvis",
          "12-month history",
        ],
        cta: "Try 14 days free",
      },
      {
        name: "Scale",
        amount: "€129",
        period: "/ month",
        tag: null,
        featured: false,
        features: [
          "Multi-location",
          "Connector marketplace",
          "VAT export preparation",
          "Priority support",
        ],
        cta: "Contact us",
      },
    ],
  },
  faq: {
    kicker: "FAQ",
    heading: "What you want to know beforehand.",
    sub: "Three questions come up all the time. Here are the real answers, no corporate speak.",
    items: [
      {
        q: "Can Jarvis send an email without me seeing it?",
        a: "No. Every action goes through a cancellable 24 h window, shown in your feed. A countdown runs in plain sight. One click on 'Cancel' stops the action for good. You can also switch a skill to manual approval mode: nothing goes out without your click.",
      },
      {
        q: "What happens to my data?",
        a: "OAuth tokens encrypted server-side with AES-256-GCM. Attachments used for extraction are never stored. No third-party model is trained on your data. You can export then delete your account in one action.",
      },
      {
        q: "How long until I'm up and running?",
        a: "About 10 minutes: connect Gmail, connect Google Business, choose which skills to enable. The first morning brief arrives the next day at 8 am. The first loop fires as soon as a business event arrives.",
      },
    ],
  },
  footer: {
    tagline: "The autonomous copilot for businesses without an assistant.",
    product: "Product",
    resources: "Resources",
    contact: "Contact",
    status: "Status",
    changelog: "Changelog",
    legal: "Legal notice",
    privacy: "Privacy",
    rights: "© 2026 OKITO — Paris",
  },
};

export const CONTENT: Record<Lang, LandingContent> = { fr, en };

export function resolveLang(raw: string | string[] | undefined): Lang {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "en" ? "en" : "fr";
}
