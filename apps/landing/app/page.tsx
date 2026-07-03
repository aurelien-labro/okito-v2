import Link from "next/link";
import { CONTENT, type LandingContent, type Lang, resolveLang } from "./_content";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = resolveLang(rawLang);
  const t = CONTENT[lang];
  return (
    <div>
      <Nav t={t} lang={lang} />
      <Hero t={t} />
      <SocialProof t={t} />
      <Features t={t} />
      <HowItWorks t={t} />
      <Verticals t={t} />
      <Pricing t={t} />
      <FAQ t={t} />
      <CTA t={t} />
      <Footer t={t} />
    </div>
  );
}

function LangToggle({ lang }: { lang: Lang }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <Link
        href="?lang=fr"
        className={
          lang === "fr" ? "font-semibold text-stone-900" : "text-stone-400 hover:text-stone-700"
        }
      >
        FR
      </Link>
      <span className="text-stone-300">/</span>
      <Link
        href="?lang=en"
        className={
          lang === "en" ? "font-semibold text-stone-900" : "text-stone-400 hover:text-stone-700"
        }
      >
        EN
      </Link>
    </div>
  );
}

function Nav({ t, lang }: { t: LandingContent; lang: Lang }) {
  return (
    <nav className="sticky top-0 z-50 border-b border-stone-200 bg-stone-50/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          OKITO
        </Link>
        <div className="hidden gap-6 text-sm text-stone-600 md:flex">
          <a href="#features" className="hover:text-stone-900">
            {t.nav.features}
          </a>
          <a href="#how" className="hover:text-stone-900">
            {t.nav.how}
          </a>
          <a href="#pricing" className="hover:text-stone-900">
            {t.nav.pricing}
          </a>
          <a href="#faq" className="hover:text-stone-900">
            {t.nav.faq}
          </a>
        </div>
        <div className="flex items-center gap-3">
          <LangToggle lang={lang} />
          <a href="#cta" className="hidden text-sm text-stone-600 hover:text-stone-900 md:inline">
            {t.nav.trial}
          </a>
          <a
            href="mailto:hello@okito.app?subject=Demande%20de%20d%C3%A9mo%20OKITO"
            className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
          >
            {t.nav.demo}
          </a>
        </div>
      </div>
    </nav>
  );
}

function Hero({ t }: { t: LandingContent }) {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 text-center">
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs text-stone-600">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {t.hero.badge}
      </div>
      <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
        {t.hero.titleLead}
        <br />
        <span className="text-stone-500">{t.hero.titleAccent}</span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-600">{t.hero.subtitle}</p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <a
          href="mailto:hello@okito.app?subject=Demande%20de%20d%C3%A9mo%20OKITO"
          className="rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-700"
        >
          {t.hero.ctaDemo}
        </a>
        <a
          href="#how"
          className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-medium hover:bg-stone-100"
        >
          {t.hero.ctaHow}
        </a>
      </div>
      <p className="mt-4 text-xs text-stone-500">{t.hero.reassurance}</p>
    </section>
  );
}

function SocialProof({ t }: { t: LandingContent }) {
  return (
    <section className="border-y border-stone-200 bg-white py-10">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-xs uppercase tracking-widest text-stone-500">
          {t.proof.tagline}
        </p>
        <div className="mt-8 grid grid-cols-2 gap-6 text-center md:grid-cols-4">
          {t.proof.stats.map((s) => (
            <Stat key={s.label} value={s.value} label={s.label} />
          ))}
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

function Features({ t }: { t: LandingContent }) {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24">
      <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
        {t.features.heading}
        <br />
        <span className="text-stone-500">{t.features.headingAccent}</span>
      </h2>
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {t.features.items.map((it) => (
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

function HowItWorks({ t }: { t: LandingContent }) {
  return (
    <section id="how" className="border-y border-stone-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          {t.how.heading}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-stone-600">{t.how.subtitle}</p>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {t.how.steps.map((s) => (
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

function Verticals({ t }: { t: LandingContent }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 text-center">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t.verticals.heading}</h2>
      <p className="mx-auto mt-4 max-w-2xl text-stone-600">{t.verticals.subtitle}</p>
      <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
        {t.verticals.items.map((v) => (
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

function Pricing({ t }: { t: LandingContent }) {
  return (
    <section id="pricing" className="border-y border-stone-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          {t.pricing.heading}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-stone-600">{t.pricing.subtitle}</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {t.pricing.plans.map((p) => (
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

function FAQ({ t }: { t: LandingContent }) {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
      <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
        {t.faq.heading}
      </h2>
      <div className="mt-10 space-y-3">
        {t.faq.items.map((it) => (
          <details key={it.q} className="rounded-2xl border border-stone-200 bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold">{it.q}</summary>
            <p className="mt-3 text-sm text-stone-600">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CTA({ t }: { t: LandingContent }) {
  return (
    <section id="cta" className="border-t border-stone-200 bg-stone-900 text-white">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t.cta.heading}</h2>
        <p className="mt-4 text-stone-300">{t.cta.subtitle}</p>
        <a
          href="mailto:hello@okito.app?subject=Demande%20de%20d%C3%A9mo%20OKITO"
          className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-sm font-medium text-stone-900 hover:bg-stone-100"
        >
          {t.cta.button}
        </a>
        <p className="mt-4 text-xs text-stone-500">{t.cta.note}</p>
      </div>
    </section>
  );
}

function Footer({ t }: { t: LandingContent }) {
  return (
    <footer className="border-t border-stone-200 bg-stone-50">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-stone-500 md:flex-row">
        <div>
          © {new Date().getFullYear()} OKITO. {t.footer.rights}
        </div>
        <div className="flex gap-6">
          <a href="/legal/terms" className="hover:text-stone-900">
            {t.footer.legal}
          </a>
          <a href="/legal/privacy" className="hover:text-stone-900">
            {t.footer.privacy}
          </a>
          <a href="mailto:hello@okito.app" className="hover:text-stone-900">
            {t.footer.contact}
          </a>
        </div>
      </div>
    </footer>
  );
}
