"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type TenantSite,
  getCurrentTenantId,
  getSite,
  publishSite,
  unpublishSite,
  upsertSite,
} from "../_lib/api-client";

const LANDING_URL = process.env.NEXT_PUBLIC_OKITO_LANDING_URL ?? "http://localhost:3002";

interface OfferItem {
  name: string;
  description: string;
  price: string;
}

export default function SitePage() {
  return (
    <LoginGate>
      <SiteEditor />
    </LoginGate>
  );
}

function SiteEditor() {
  const [site, setSite] = useState<TenantSite | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Champs du formulaire (hydratés depuis le site existant).
  const [slug, setSlug] = useState("");
  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [heroCta, setHeroCta] = useState("");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerItems, setOfferItems] = useState<OfferItem[]>([]);
  const [infoAddress, setInfoAddress] = useState("");
  const [infoHours, setInfoHours] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");

  const hydrate = useCallback((s: TenantSite | null) => {
    setSite(s);
    if (!s) return;
    const hero = (s.blocks.hero ?? {}) as Record<string, string>;
    const offer = (s.blocks.offer ?? {}) as { title?: string; items?: OfferItem[] };
    const info = (s.blocks.info ?? {}) as Record<string, string>;
    const contact = (s.blocks.contact ?? {}) as Record<string, string>;
    setSlug(s.slug);
    setHeroTitle(hero.title ?? "");
    setHeroSubtitle(hero.subtitle ?? "");
    setHeroImageUrl(hero.imageUrl ?? "");
    setHeroCta(hero.ctaLabel ?? "");
    setOfferTitle(offer.title ?? "");
    setOfferItems(
      (offer.items ?? []).map((i) => ({
        name: i.name ?? "",
        description: i.description ?? "",
        price: i.price ?? "",
      })),
    );
    setInfoAddress(info.address ?? "");
    setInfoHours(info.hours ?? "");
    setContactPhone(contact.phone ?? "");
    setContactEmail(contact.email ?? "");
    setSeoTitle(s.seo.title ?? "");
    setSeoDescription(s.seo.description ?? "");
  }, []);

  const reload = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    try {
      const res = await getSite(tenantId);
      hydrate(res.data);
      setErr(null);
    } catch (e) {
      if ((e as { status?: number }).status === 404) setUnavailable(true);
      else setErr(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoaded(true);
    }
  }, [hydrate]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const res = await upsertSite(tenantId, {
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        blocks: {
          hero: {
            title: heroTitle.trim(),
            subtitle: heroSubtitle.trim(),
            imageUrl: heroImageUrl.trim(),
            ctaLabel: heroCta.trim(),
          },
          offer: {
            title: offerTitle.trim(),
            items: offerItems.filter((i) => i.name.trim()),
          },
          info: { address: infoAddress.trim(), hours: infoHours.trim() },
          contact: { phone: contactPhone.trim(), email: contactEmail.trim() },
        },
        seo: { title: seoTitle.trim(), description: seoDescription.trim() },
      });
      hydrate(res.data);
      setSaved(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishToggle() {
    const tenantId = getCurrentTenantId();
    if (!tenantId || !site) return;
    setBusy(true);
    setErr(null);
    try {
      const res =
        site.status === "published" ? await unpublishSite(tenantId) : await publishSite(tenantId);
      hydrate(res.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  if (unavailable) {
    return (
      <div className="p-8 text-sm text-stone-500">
        Module site non monté côté API (redémarrer l&apos;API après mise à jour).
      </div>
    );
  }
  if (!loaded) return <div className="p-8 text-sm text-stone-500">Chargement…</div>;

  const publicUrl = site ? `${LANDING_URL}/s/${site.slug}` : null;

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Site web</h1>
          <p className="mt-1 text-sm text-stone-500">
            Votre site vitrine hébergé par OKITO : remplissez les blocs, prévisualisez, publiez.
          </p>
        </div>
        {site && (
          <div className="flex items-center gap-3">
            {site.status === "published" ? (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                En ligne
              </span>
            ) : (
              <span className="rounded bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
                Brouillon
              </span>
            )}
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-indigo-700 hover:underline"
              >
                {site.status === "published" ? "Voir le site" : "Prévisualiser"}
              </a>
            )}
            <button
              type="button"
              onClick={handlePublishToggle}
              disabled={busy}
              className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {site.status === "published" ? "Dépublier" : "Publier"}
            </button>
          </div>
        )}
      </header>

      {err && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}
      {saved && (
        <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Enregistré.
        </div>
      )}

      <form onSubmit={handleSave} className="mt-6 space-y-6">
        <Card title="Adresse du site">
          <label className="block max-w-md">
            <span className="mb-1 block text-xs font-medium text-stone-700">Slug public</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-500">okito.app/s/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="mon-commerce"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
          </label>
        </Card>

        <Card title="Accueil (hero)">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Titre"
              value={heroTitle}
              onChange={setHeroTitle}
              placeholder="Le Bistrot"
            />
            <Field
              label="Bouton d'action"
              value={heroCta}
              onChange={setHeroCta}
              placeholder="Réserver"
            />
          </div>
          <Field
            label="Sous-titre"
            value={heroSubtitle}
            onChange={setHeroSubtitle}
            placeholder="Cuisine de saison au cœur de Paris"
          />
          <Field
            label="Photo (URL)"
            value={heroImageUrl}
            onChange={setHeroImageUrl}
            placeholder="https://…"
          />
        </Card>

        <Card title="Offre (menu / prestations)">
          <Field
            label="Titre de la section"
            value={offerTitle}
            onChange={setOfferTitle}
            placeholder="Notre carte"
          />
          <div className="space-y-3">
            {offerItems.map((item, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lignes éditables sans identité propre
              <div key={i} className="flex flex-wrap items-end gap-3">
                <Field
                  label="Nom"
                  value={item.name}
                  onChange={(v) => setOfferItems(patch(offerItems, i, { name: v }))}
                  className="min-w-40 flex-1"
                />
                <Field
                  label="Description"
                  value={item.description}
                  onChange={(v) => setOfferItems(patch(offerItems, i, { description: v }))}
                  className="min-w-52 flex-[2]"
                />
                <Field
                  label="Prix"
                  value={item.price}
                  onChange={(v) => setOfferItems(patch(offerItems, i, { price: v }))}
                  className="w-24"
                />
                <button
                  type="button"
                  onClick={() => setOfferItems(offerItems.filter((_, j) => j !== i))}
                  className="pb-2 text-xs text-rose-700 hover:underline"
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOfferItems([...offerItems, { name: "", description: "", price: "" }])}
            className="mt-3 text-xs font-medium text-indigo-700 hover:underline"
          >
            + Ajouter une ligne
          </button>
        </Card>

        <Card title="Infos pratiques">
          <Field
            label="Adresse"
            value={infoAddress}
            onChange={setInfoAddress}
            placeholder="12 rue de la Paix, 75002 Paris"
          />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-700">Horaires</span>
            <textarea
              value={infoHours}
              onChange={(e) => setInfoHours(e.target.value)}
              rows={3}
              placeholder={"Mar–Sam : 12h–14h30 / 19h–22h\nDim–Lun : fermé"}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Téléphone"
              value={contactPhone}
              onChange={setContactPhone}
              placeholder="+33 1 23 45 67 89"
            />
            <Field
              label="Email"
              value={contactEmail}
              onChange={setContactEmail}
              placeholder="contact@moncommerce.fr"
            />
          </div>
        </Card>

        <Card title="Référencement (SEO)">
          <Field
            label="Titre de la page"
            value={seoTitle}
            onChange={setSeoTitle}
            placeholder="Le Bistrot — restaurant à Paris 2e"
          />
          <Field
            label="Description"
            value={seoDescription}
            onChange={setSeoDescription}
            placeholder="Cuisine de saison, réservation en ligne."
          />
        </Card>

        <div>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : site ? "Enregistrer" : "Créer mon site"}
          </button>
        </div>
      </form>
    </div>
  );
}

function patch(items: OfferItem[], index: number, change: Partial<OfferItem>): OfferItem[] {
  return items.map((item, i) => (i === index ? { ...item, ...change } : item));
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs font-medium text-stone-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
      />
    </label>
  );
}
