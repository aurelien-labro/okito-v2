import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";

const API_URL = process.env.NEXT_PUBLIC_OKITO_API_URL ?? "http://localhost:3001";

interface PublicSite {
  slug: string;
  theme: string;
  blocks: {
    hero?: { title?: string; subtitle?: string; imageUrl?: string; ctaLabel?: string };
    offer?: {
      title?: string;
      items?: Array<{ name?: string; description?: string; price?: string }>;
    };
    info?: { address?: string; hours?: string; phone?: string };
    reviews?: { items?: Array<{ author?: string; rating?: number; text?: string }> };
    contact?: { phone?: string; email?: string };
  };
  seo: { title?: string; description?: string };
  tenant: { id: string; name: string; contactPhone: string | null };
}

async function fetchSite(slug: string): Promise<PublicSite | null> {
  const res = await fetch(`${API_URL}/v1/sites/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.data ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await fetchSite(slug);
  if (!site) return { title: "Site introuvable" };
  return {
    title: site.seo.title ?? site.tenant.name,
    description: site.seo.description ?? `${site.tenant.name} — réservez en ligne.`,
  };
}

/**
 * Rendu public d'un site vitrine hébergé (site builder V1) : page mono-bloc
 * servie par slug, données du site publié via l'API. Le tracker analytics du
 * tenant est injecté automatiquement (chaque visite alimente le journal Jarvis).
 */
export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await fetchSite(slug);
  if (!site) notFound();

  const { hero, offer, info, reviews, contact } = site.blocks;
  const phone = contact?.phone ?? info?.phone ?? site.tenant.contactPhone;

  return (
    <main className="min-h-screen bg-white text-stone-900">
      <Script src={`${API_URL}/v1/track/${site.tenant.id}/script.js`} strategy="afterInteractive" />

      <section className="bg-stone-900 px-6 py-24 text-center text-white">
        {hero?.imageUrl ? (
          /* image distante libre : pas de domaine connu à whitelister pour next/image */
          <img
            src={hero.imageUrl}
            alt=""
            className="mx-auto mb-8 h-40 w-40 rounded-full object-cover"
          />
        ) : null}
        <h1 className="text-4xl font-bold sm:text-5xl">{hero?.title ?? site.tenant.name}</h1>
        {hero?.subtitle ? <p className="mt-4 text-lg text-stone-300">{hero.subtitle}</p> : null}
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="mt-8 inline-block rounded-full bg-indigo-500 px-8 py-3 font-semibold text-white hover:bg-indigo-400"
          >
            {hero?.ctaLabel ?? "Réserver"}
          </a>
        ) : null}
      </section>

      {offer?.items?.length ? (
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="mb-8 text-center text-2xl font-bold">{offer.title ?? "Notre offre"}</h2>
          <ul className="space-y-4">
            {offer.items.map((item, i) => (
              <li
                key={item.name ?? i}
                className="flex items-baseline justify-between gap-4 border-b border-stone-200 pb-4"
              >
                <div>
                  <p className="font-semibold">{item.name}</p>
                  {item.description ? (
                    <p className="text-sm text-stone-600">{item.description}</p>
                  ) : null}
                </div>
                {item.price ? <p className="shrink-0 font-medium">{item.price}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reviews?.items?.length ? (
        <section className="bg-stone-50 px-6 py-16">
          <h2 className="mb-8 text-center text-2xl font-bold">Ils en parlent</h2>
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
            {reviews.items.slice(0, 4).map((r, i) => (
              <blockquote key={r.author ?? i} className="rounded-xl bg-white p-6 shadow-sm">
                {typeof r.rating === "number" ? (
                  <p aria-label={`${r.rating} étoiles`} className="text-amber-500">
                    {"★".repeat(Math.max(0, Math.min(5, Math.round(r.rating))))}
                  </p>
                ) : null}
                {r.text ? <p className="mt-2 text-stone-700">{r.text}</p> : null}
                {r.author ? (
                  <footer className="mt-3 text-sm text-stone-500">— {r.author}</footer>
                ) : null}
              </blockquote>
            ))}
          </div>
        </section>
      ) : null}

      {info || phone ? (
        <section className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="mb-6 text-2xl font-bold">Infos pratiques</h2>
          {info?.address ? <p className="text-stone-700">{info.address}</p> : null}
          {info?.hours ? (
            <p className="mt-2 whitespace-pre-line text-stone-700">{info.hours}</p>
          ) : null}
          {phone ? (
            <p className="mt-2">
              <a href={`tel:${phone}`} className="font-medium text-indigo-600 hover:underline">
                {phone}
              </a>
            </p>
          ) : null}
          {contact?.email ? (
            <p className="mt-1">
              <a
                href={`mailto:${contact.email}`}
                className="font-medium text-indigo-600 hover:underline"
              >
                {contact.email}
              </a>
            </p>
          ) : null}
        </section>
      ) : null}

      <footer className="border-t border-stone-200 px-6 py-8 text-center text-sm text-stone-500">
        {site.tenant.name} — site propulsé par{" "}
        <a href="https://okito.app" className="font-medium text-indigo-600 hover:underline">
          OKITO
        </a>
      </footer>
    </main>
  );
}
