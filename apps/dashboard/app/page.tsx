import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <Skills />
      <HowItWorks />
      <Modules />
      <PricingPreview />
      <FinalCTA />
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto max-w-5xl px-6 pt-16 pb-10 text-center md:pt-24 md:pb-14">
      {/* Halo chaud très discret derrière le hero — sort du "flat blanc". */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]"
        style={{
          background:
            "radial-gradient(600px 320px at 50% 20%, rgba(249,115,22,0.06), transparent 70%)",
        }}
      />
      <div className="anim-fade-up okito-hairline mx-auto mb-6 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] text-slate-600">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
        En direct — Jarvis a traité 4 avis Google ce matin
      </div>
      <h1
        className="anim-fade-up mx-auto max-w-3xl text-4xl font-medium tracking-tight text-slate-900 md:text-5xl"
        style={{ animationDelay: "80ms" }}
      >
        Ton commerce tourne.
        <br />
        <span className="text-slate-500">Toi, tu vis.</span>
      </h1>
      <p
        className="anim-fade-up mx-auto mt-5 max-w-xl text-base text-slate-600"
        style={{ animationDelay: "160ms" }}
      >
        Jarvis répond aux avis, confirme les résas, relance les factures, poste sur Insta — pendant
        que tu bosses en salle.
      </p>
      <div
        className="anim-fade-up mt-8 flex flex-wrap items-center justify-center gap-3"
        style={{ animationDelay: "220ms" }}
      >
        <Link
          href="/pricing"
          className="okito-hover rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Commencer — 1 mois offert →
        </Link>
        <Link
          href="#skills"
          className="okito-hairline okito-hover rounded-md bg-white px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Voir une démo (60 s)
        </Link>
      </div>
      <p
        className="anim-fade-up mt-4 text-[11px] text-slate-400"
        style={{ animationDelay: "280ms" }}
      >
        Sans CB · Installé en 3 min · Résiliation en un clic
      </p>
      <ProductPreview />
    </section>
  );
}

function ProductPreview() {
  return (
    <div
      className="okito-hairline okito-hover anim-fade-up mx-auto mt-10 grid max-w-2xl grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[12px] bg-white px-3 py-3 text-left"
      style={{ animationDelay: "360ms" }}
    >
      <span
        className="ti ti-sparkles flex size-9 items-center justify-center rounded-md bg-indigo-50 text-[16px] text-indigo-600"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500">Ce matin, Jarvis a fait</div>
        <div className="truncate text-[13px] font-medium text-slate-900">
          3 réponses aux avis · 2 relances facture · 1 post Instagram programmé
        </div>
      </div>
      <span className="okito-num rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
        +47 min
      </span>
    </div>
  );
}

function TrustStrip() {
  const stats = [
    { value: "12h", label: "gagnées par semaine" },
    { value: "+38%", label: "d'avis Google traités" },
    { value: "24/7", label: "sur ton commerce" },
    { value: "3 min", label: "à installer" },
  ];
  return (
    <section className="okito-hairline-t okito-hairline-b bg-slate-50/60">
      <div className="anim-stagger mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-8 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="okito-num text-2xl font-medium text-slate-900">{s.value}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Skills() {
  const skills = [
    {
      icon: "ti-run",
      title: "Coach quotidien",
      desc: "Ton brief du matin, tes rappels dans la journée, ton débrief du soir.",
    },
    {
      icon: "ti-brand-instagram",
      title: "Social auto-piloté",
      desc: "Jarvis rédige et programme Insta/Facebook/Google à partir de ton actu.",
    },
    {
      icon: "ti-trending-up",
      title: "Prévisions & staffing",
      desc: "Combien de couverts la semaine prochaine ? Combien de personnes prévoir ?",
    },
    {
      icon: "ti-radar-2",
      title: "Radar concurrence",
      desc: "Jarvis surveille tes concurrents locaux et te remonte l'essentiel.",
    },
  ];
  return (
    <section id="skills" className="mx-auto max-w-5xl px-6 py-20">
      <SectionHead
        eyebrow="Skills"
        title="Jarvis a des mains, pas juste une bouche."
        desc="Contrairement aux assistants qui « conseillent », les Skills OKITO exécutent le travail à ta place — avec ton feu vert quand c'est sensible."
      />
      <div className="anim-stagger mt-10 grid gap-4 md:grid-cols-2">
        {skills.map((s) => (
          <div key={s.title} className="okito-hairline okito-hover rounded-[12px] bg-white p-5">
            <span
              className={`ti ${s.icon} mb-3 flex size-9 items-center justify-center rounded-md bg-indigo-50 text-[17px] text-indigo-600`}
              aria-hidden="true"
            />
            <div className="text-sm font-medium text-slate-900">{s.title}</div>
            <p className="mt-1.5 text-[13px] text-slate-600">{s.desc}</p>
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
      title: "Connecte tes outils",
      desc: "Google, Instagram, ton mail pro, ton POS. 3 min chrono.",
    },
    {
      n: "02",
      title: "Jarvis observe une semaine",
      desc: "Il apprend ton commerce, ta clientèle, ton rythme. Aucune action sans ton accord.",
    },
    {
      n: "03",
      title: "Jarvis prend la main",
      desc: "Tu valides ce qui est sensible depuis le brief. Le reste, il le fait tout seul.",
    },
  ];
  return (
    <section className="okito-hairline-t bg-slate-50/40">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <SectionHead eyebrow="Comment ça marche" title="3 étapes. C'est tout." />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="okito-hairline rounded-[12px] bg-white p-6">
              <div className="okito-num mb-3 text-xs font-medium text-slate-400">{s.n}</div>
              <div className="text-sm font-medium text-slate-900">{s.title}</div>
              <p className="mt-1.5 text-[13px] text-slate-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Modules() {
  const mods = [
    { icon: "ti-inbox", label: "Inbox unifiée" },
    { icon: "ti-calendar", label: "Agenda & réservations" },
    { icon: "ti-users", label: "Fichier clients" },
    { icon: "ti-file-invoice", label: "Factures & compta" },
    { icon: "ti-speakerphone", label: "Marketing" },
    { icon: "ti-microphone", label: "Voix Jarvis" },
    { icon: "ti-world", label: "Site web" },
    { icon: "ti-plug", label: "Intégrations" },
  ];
  return (
    <section id="modules" className="mx-auto max-w-5xl px-6 py-20">
      <SectionHead
        eyebrow="Modules"
        title="Un outil, pas dix onglets."
        desc="Tout ce dont ton commerce a besoin, dans une seule interface."
      />
      <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {mods.map((m) => (
          <div
            key={m.label}
            className="okito-hairline flex items-center gap-2.5 rounded-md bg-white px-3 py-3 text-[13px] text-slate-800"
          >
            <span className={`ti ${m.icon} text-[15px] text-slate-500`} aria-hidden="true" />
            {m.label}
          </div>
        ))}
      </div>
    </section>
  );
}

function PricingPreview() {
  const plans = [
    { name: "Starter", price: "0€", note: "1 mois offert", cta: "Essayer" },
    { name: "Pro", price: "49€", note: "par mois", cta: "S'abonner", highlighted: true },
    { name: "Scale", price: "129€", note: "par mois", cta: "Découvrir" },
  ];
  return (
    <section className="okito-hairline-t bg-slate-50/40">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <SectionHead
          eyebrow="Tarifs"
          title="Un abonnement clair. Pas de piège."
          desc="Change quand tu veux. Résilie quand tu veux."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={
                p.highlighted
                  ? "relative rounded-[12px] border-2 border-indigo-600 bg-white p-6"
                  : "okito-hairline rounded-[12px] bg-white p-6"
              }
            >
              {p.highlighted && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                  Recommandé
                </span>
              )}
              <div className="text-sm font-medium text-slate-900">{p.name}</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="okito-num text-3xl font-medium text-slate-900">{p.price}</span>
                <span className="text-xs text-slate-500">{p.note}</span>
              </div>
              <Link
                href="/pricing"
                className={
                  p.highlighted
                    ? "mt-5 block w-full rounded-md bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-indigo-500"
                    : "okito-hairline mt-5 block w-full rounded-md bg-white px-4 py-2 text-center text-sm font-medium text-slate-900 hover:bg-slate-50"
                }
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-[12px] text-slate-500">
          <Link href="/pricing" className="text-indigo-600 hover:underline">
            Voir le détail des plans →
          </Link>
        </p>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h2 className="text-3xl font-medium tracking-tight text-slate-900 md:text-4xl">
        Prêt à laisser Jarvis bosser à ta place ?
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-sm text-slate-600">
        Installe OKITO en 3 min. Un mois offert. Aucun engagement.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/pricing"
          className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Commencer
        </Link>
        <Link
          href="/app"
          className="okito-hairline rounded-md bg-white px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          J'ai déjà un compte
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="okito-hairline-t bg-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 text-[12px] text-slate-500 md:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded bg-black text-[10px] font-medium text-white">
            O
          </div>
          <span>© {new Date().getFullYear()} OKITO</span>
        </div>
        <nav className="flex gap-5">
          <Link href="/pricing" className="hover:text-slate-900">
            Tarifs
          </Link>
          <Link href="/app" className="hover:text-slate-900">
            Dashboard
          </Link>
          <a href="mailto:hello@okito.app" className="hover:text-slate-900">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}

function SectionHead({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-slate-400">
        {eyebrow}
      </div>
      <h2 className="text-2xl font-medium tracking-tight text-slate-900 md:text-3xl">{title}</h2>
      {desc && <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600">{desc}</p>}
    </div>
  );
}
