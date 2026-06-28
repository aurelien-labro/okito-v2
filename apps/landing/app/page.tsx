import Link from "next/link";

export default function LandingPage() {
  return (
    <div>
      <Nav />
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <Verticals />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-stone-200 bg-stone-50/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          OKITO
        </Link>
        <div className="hidden gap-6 text-sm text-stone-600 md:flex">
          <a href="#features" className="hover:text-stone-900">
            Fonctionnalités
          </a>
          <a href="#how" className="hover:text-stone-900">
            Comment ça marche
          </a>
          <a href="#pricing" className="hover:text-stone-900">
            Tarifs
          </a>
          <a href="#faq" className="hover:text-stone-900">
            FAQ
          </a>
        </div>
        <div className="flex items-center gap-3">
          <a href="#cta" className="hidden text-sm text-stone-600 hover:text-stone-900 md:inline">
            Essai gratuit
          </a>
          <a
            href="mailto:hello@okito.app?subject=Demande%20de%20d%C3%A9mo%20OKITO"
            className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
          >
            Demander une démo
          </a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 text-center">
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs text-stone-600">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        En production · agents IA voix & WhatsApp
      </div>
      <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
        L&apos;IA qui prend vos réservations
        <br />
        <span className="text-stone-500">24h/24, à votre place.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-600">
        Vos clients appellent, WhatsAppent, cliquent sur votre widget. OKITO répond, comprend,
        confirme et note la résa dans votre agenda. Vous récupérez le temps perdu au téléphone.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <a
          href="mailto:hello@okito.app?subject=Demande%20de%20d%C3%A9mo%20OKITO"
          className="rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-700"
        >
          Demander une démo
        </a>
        <a
          href="#how"
          className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-medium hover:bg-stone-100"
        >
          Voir comment ça marche
        </a>
      </div>
      <p className="mt-4 text-xs text-stone-500">
        Sans engagement · Mise en route en 24h · Vos données restent en Europe.
      </p>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="border-y border-stone-200 bg-white py-10">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-xs uppercase tracking-widest text-stone-500">
          Pensé pour la restauration, hôtellerie, garages, salons, services à booking
        </p>
        <div className="mt-8 grid grid-cols-2 gap-6 text-center md:grid-cols-4">
          <Stat value="< 2s" label="Réponse vocale" />
          <Stat value="24/7" label="Disponibilité" />
          <Stat value="-80%" label="Appels manqués" />
          <Stat value="FR · EN · ES" label="Multilingue" />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-stone-500">{label}</div>
    </div>
  );
}

function Features() {
  const items = [
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
      title: "Inventaire de tables",
      body: "Définissez vos tables (T1 2pl., T2 4pl., …). OKITO sélectionne la plus petite table qui passe. Vous n'optimisez plus à la main.",
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
  ];
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24">
      <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
        Tout ce qu&apos;un·e bon·ne réceptionniste fait.
        <br />
        <span className="text-stone-500">
          Sans pauses, sans absences, sans rage du vendredi soir.
        </span>
      </h2>
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.title}
            className="rounded-2xl border border-stone-200 bg-white p-5 hover:shadow-sm"
          >
            <div className="text-sm font-semibold">{it.title}</div>
            <p className="mt-2 text-sm text-stone-600">{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "On vous connecte en 24h",
      body: "Numéro vocal dédié + numéro WhatsApp Business + snippet à coller sur votre site. On configure vos horaires, vos tables et votre ton.",
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
  ];
  return (
    <section id="how" className="border-y border-stone-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Comment ça marche
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-stone-600">
          Pas de setup à rallonge. Pas d&apos;intégration douloureuse. On s&apos;occupe de tout.
        </p>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-stone-200 p-6">
              <div className="text-xs font-mono text-stone-400">{s.n}</div>
              <div className="mt-2 text-base font-semibold">{s.title}</div>
              <p className="mt-2 text-sm text-stone-600">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Verticals() {
  const verts = [
    { emoji: "🍽️", label: "Restaurants" },
    { emoji: "🏨", label: "Hôtels" },
    { emoji: "💇", label: "Salons / spa" },
    { emoji: "🚗", label: "Garages" },
    { emoji: "🏡", label: "Locations courte durée" },
    { emoji: "📅", label: "Tout métier à booking" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 text-center">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Vertical-agnostique.</h2>
      <p className="mx-auto mt-4 max-w-2xl text-stone-600">
        Le moteur s&apos;adapte au vocabulaire et aux règles de votre métier. Un même compte,
        plusieurs établissements.
      </p>
      <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
        {verts.map((v) => (
          <div
            key={v.label}
            className="rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-medium"
          >
            <span className="mr-2">{v.emoji}</span>
            {v.label}
          </div>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
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
        "Inventaire de tables",
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
  ];
  return (
    <section id="pricing" className="border-y border-stone-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Tarifs simples
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-stone-600">
          Sans engagement. Premier mois gratuit. Annulable à tout moment.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-6 ${
                p.tag
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-200 bg-white text-stone-900"
              }`}
            >
              {p.tag && (
                <div className="absolute -top-3 right-6 rounded-full bg-amber-300 px-3 py-0.5 text-xs font-semibold text-stone-900">
                  {p.tag}
                </div>
              )}
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold">{p.price}</span>
                <span className="text-sm opacity-80">{p.period}</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className={p.tag ? "text-amber-300" : "text-emerald-600"}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="mailto:hello@okito.app?subject=Demande%20OKITO%20-%20Plan%20"
                className={`mt-6 block rounded-full px-4 py-2 text-center text-sm font-medium ${
                  p.tag
                    ? "bg-white text-stone-900 hover:bg-stone-100"
                    : "bg-stone-900 text-white hover:bg-stone-700"
                }`}
              >
                {p.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const qa = [
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
      a: "24h en moyenne. On configure votre ligne, vos horaires, vos tables. Vous validez quelques messages-types et c'est en route.",
    },
  ];
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
      <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">FAQ</h2>
      <div className="mt-10 space-y-3">
        {qa.map((it) => (
          <details key={it.q} className="rounded-2xl border border-stone-200 bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold">{it.q}</summary>
            <p className="mt-3 text-sm text-stone-600">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section id="cta" className="border-t border-stone-200 bg-stone-900 text-white">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Reprenez votre soirée.
        </h2>
        <p className="mt-4 text-stone-300">
          15 minutes de démo. Une simulation sur votre vraie ligne. Vous voyez si ça tient ou pas.
        </p>
        <a
          href="mailto:hello@okito.app?subject=Demande%20de%20d%C3%A9mo%20OKITO"
          className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-sm font-medium text-stone-900 hover:bg-stone-100"
        >
          Demander une démo
        </a>
        <p className="mt-4 text-xs text-stone-500">hello@okito.app — réponse sous 24h ouvrées</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-50">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-stone-500 md:flex-row">
        <div>© {new Date().getFullYear()} OKITO. Tous droits réservés.</div>
        <div className="flex gap-6">
          <a
            href="mailto:hello@okito.app?subject=Mentions%20l%C3%A9gales"
            className="hover:text-stone-900"
          >
            Mentions légales
          </a>
          <a
            href="mailto:hello@okito.app?subject=Confidentialit%C3%A9"
            className="hover:text-stone-900"
          >
            Confidentialité
          </a>
          <a href="mailto:hello@okito.app" className="hover:text-stone-900">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
