import Link from "next/link";
import { JarvisDemo } from "./_components/jarvis-demo";
import { ThemeToggle } from "./_components/theme-toggle";
import { CONTENT, type LandingContent, type Lang, resolveLang } from "./_content";

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://app.okito.app";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = resolveLang(rawLang);
  const t = CONTENT[lang];
  return (
    <>
      <Nav t={t} lang={lang} />
      <main id="top">
        <Hero t={t} />
        <Skills t={t} />
        <How t={t} />
        <Pricing t={t} />
        <FAQ t={t} />
      </main>
      <Footer t={t} />
    </>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function LangToggle({ lang }: { lang: Lang }) {
  return (
    <div className="lang-toggle">
      <Link href="?lang=fr" className={lang === "fr" ? "active" : ""}>
        FR
      </Link>
      <span>/</span>
      <Link href="?lang=en" className={lang === "en" ? "active" : ""}>
        EN
      </Link>
    </div>
  );
}

function Nav({ t, lang }: { t: LandingContent; lang: Lang }) {
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <a className="brand" href="#top" aria-label="OKITO, retour en haut">
          <span className="brand-mark" aria-hidden="true" />
          <span>OKITO</span>
        </a>
        <nav className="links" aria-label="Sections">
          <a href="#skills">{t.nav.skills}</a>
          <a href="#how">{t.nav.how}</a>
          <a href="#pricing">{t.nav.pricing}</a>
          <a href="#faq">{t.nav.faq}</a>
        </nav>
        <div className="nav-cta">
          <LangToggle lang={lang} />
          <ThemeToggle />
          <a href={DASHBOARD_URL} className="btn ghost">
            {t.nav.login}
          </a>
          <a href={DASHBOARD_URL} className="btn primary">
            {t.nav.cta}
            <ArrowIcon />
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero({ t }: { t: LandingContent }) {
  return (
    <section className="hero wrap">
      <div>
        <span className="eyebrow">
          <span className="dot" /> {t.hero.eyebrow}
        </span>
        <h1 className="display">
          {t.hero.titleLead}
          <em>{t.hero.titleEm}</em>
          {t.hero.titleTail}
        </h1>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: contenu statique de _content.ts, aucune entrée utilisateur */}
        <p className="lede" dangerouslySetInnerHTML={{ __html: t.hero.ledeHtml }} />
        <div className="hero-cta">
          <a href={DASHBOARD_URL} className="btn primary">
            {t.hero.ctaPrimary}
            <ArrowIcon />
          </a>
          <a href="#how" className="btn">
            {t.hero.ctaSecondary}
          </a>
          <span className="note">{t.hero.note}</span>
        </div>
        <div className="trust-strip" aria-label="Intégrations">
          {t.hero.integrations.map((name, i) => (
            <span key={name} style={{ display: "contents" }}>
              {i > 0 && <span className="sep" />}
              <span>{name}</span>
            </span>
          ))}
        </div>
      </div>
      <JarvisDemo t={t.demo} />
    </section>
  );
}

function SectionHeader({
  kicker,
  heading,
  sub,
}: {
  kicker: string;
  heading: string;
  sub: string;
}) {
  return (
    <header className="sec">
      <div>
        <div className="kicker">{kicker}</div>
        <h2>{heading}</h2>
      </div>
      <p className="sub">{sub}</p>
    </header>
  );
}

function Skills({ t }: { t: LandingContent }) {
  return (
    <section id="skills">
      <div className="wrap">
        <SectionHeader kicker={t.skills.kicker} heading={t.skills.heading} sub={t.skills.sub} />
        <div className="skills">
          {t.skills.items.map((s) => (
            <div className="skill" key={s.num}>
              <div className="num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: contenu statique de _content.ts, aucune entrée utilisateur */}
              <div className="loop" dangerouslySetInnerHTML={{ __html: s.loopHtml }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function How({ t }: { t: LandingContent }) {
  return (
    <section id="how" className="section-tint">
      <div className="wrap">
        <SectionHeader kicker={t.how.kicker} heading={t.how.heading} sub={t.how.sub} />
        <div className="steps">
          {t.how.steps.map((s) => (
            <div className="step" key={s.n}>
              <span className="n">{s.n}</span>
              <h4>{s.title}</h4>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing({ t }: { t: LandingContent }) {
  return (
    <section id="pricing">
      <div className="wrap">
        <SectionHeader kicker={t.pricing.kicker} heading={t.pricing.heading} sub={t.pricing.sub} />
        <div className="prices">
          {t.pricing.plans.map((p) => (
            <div className={`price${p.featured ? " featured" : ""}`} key={p.name}>
              {p.tag && <span className="tag">{p.tag}</span>}
              <h3>{p.name}</h3>
              <div className="amount">
                {p.amount} <small>{p.period}</small>
              </div>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <a
                className={`btn${p.featured ? " primary" : ""}`}
                href={p.name === "Scale" ? "mailto:hello@okito.app?subject=OKITO" : DASHBOARD_URL}
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
    <section id="faq">
      <div className="wrap">
        <SectionHeader kicker={t.faq.kicker} heading={t.faq.heading} sub={t.faq.sub} />
        <div className="faq">
          {t.faq.items.map((it, i) => (
            <details className="q" key={it.q} open={i === 0}>
              <summary>{it.q}</summary>
              <p>{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({ t }: { t: LandingContent }) {
  return (
    <footer className="site">
      <div className="wrap foot">
        <div className="col">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true" /> <strong>OKITO</strong>
          </span>
          <span>{t.footer.tagline}</span>
        </div>
        <div className="col">
          <strong>{t.footer.product}</strong>
          <a href="#skills">{t.nav.skills}</a>
          <a href="#how">{t.nav.how}</a>
          <a href="#pricing">{t.nav.pricing}</a>
        </div>
        <div className="col">
          <strong>{t.footer.resources}</strong>
          <a href="#faq">{t.nav.faq}</a>
          <a href="/legal/terms">{t.footer.legal}</a>
          <a href="/legal/privacy">{t.footer.privacy}</a>
        </div>
        <div className="col">
          <strong>{t.footer.contact}</strong>
          <a href="mailto:hello@okito.app">hello@okito.app</a>
          <span>{t.footer.rights}</span>
        </div>
      </div>
    </footer>
  );
}
