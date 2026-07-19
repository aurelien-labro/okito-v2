"use client";

import Link from "next/link";
import { useState } from "react";
import { createBillingCheckout, getCurrentTenantId } from "../_lib/api-client";

type Plan = {
  id: "starter" | "pro" | "scale";
  name: string;
  price: string;
  cadence: string;
  pitch: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "0€",
    cadence: "1 mois d'essai",
    pitch: "Pour tester Jarvis sur ton commerce sans engagement.",
    features: [
      "Brief quotidien",
      "Répondre aux avis Google (5/mois)",
      "Inbox unifiée (1 boîte)",
      "1 utilisateur",
    ],
    cta: "Démarrer l'essai",
  },
  {
    id: "pro",
    name: "Pro",
    price: "49€",
    cadence: "par mois",
    pitch: "Le plan de base — Jarvis prend la main sur ton quotidien.",
    features: [
      "Tout Starter, sans limite",
      "Skills : Coach quotidien, Social auto-piloté",
      "Voix Jarvis (appels sortants)",
      "3 utilisateurs",
      "Support prioritaire",
    ],
    highlighted: true,
    cta: "S'abonner",
  },
  {
    id: "scale",
    name: "Scale",
    price: "129€",
    cadence: "par mois",
    pitch: "Pour les commerces avec plusieurs points de vente ou équipes.",
    features: [
      "Tout Pro",
      "Skills : Prévisions & staffing, Radar concurrence",
      "Utilisateurs illimités",
      "Multi-établissements",
      "Voix clonée personnalisée",
    ],
    cta: "Passer sur Scale",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  return (
    <div className="mx-auto max-w-5xl py-6">
      <div className="mb-8 text-center">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-slate-400">
          Tarifs
        </div>
        <h1 className="text-3xl font-medium tracking-tight text-slate-900">
          Un prix. Zéro surprise.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
          Résilie en un clic. Aucun engagement.
        </p>
        <div className="okito-hairline mx-auto mt-6 inline-flex items-center rounded-full bg-white p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={`rounded-full px-3 py-1 font-medium ${!annual ? "bg-slate-900 text-white" : "text-slate-500"}`}
          >
            Mensuel
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={`rounded-full px-3 py-1 font-medium ${annual ? "bg-slate-900 text-white" : "text-slate-500"}`}
          >
            Annuel <span className="text-emerald-500">−20%</span>
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} annual={annual} />
        ))}
      </div>

      <div className="okito-hairline-t mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-around gap-4 pt-6 text-[12px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="ti ti-shield-check text-[14px] text-slate-400" aria-hidden="true" />
          Données FR · RGPD
        </span>
        <span className="flex items-center gap-1.5">
          <span className="ti ti-refresh-off text-[14px] text-slate-400" aria-hidden="true" />
          Sans engagement
        </span>
        <span className="flex items-center gap-1.5">
          <span className="ti ti-headset text-[14px] text-slate-400" aria-hidden="true" />
          Support humain 7j/7
        </span>
      </div>

      <FAQ />
    </div>
  );
}

function computePrice(plan: Plan, annual: boolean): { price: string; cadence: string } {
  if (plan.id === "starter") return { price: plan.price, cadence: plan.cadence };
  const monthly = plan.id === "pro" ? 49 : 129;
  if (!annual) return { price: `${monthly}€`, cadence: "par mois" };
  const reduced = Math.round(monthly * 0.8);
  return { price: `${reduced}€`, cadence: "par mois, facturé annuellement" };
}

function PlanCard({ plan, annual }: { plan: Plan; annual: boolean }) {
  const { price, cadence } = computePrice(plan, annual);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubscribe() {
    setErr(null);
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      setErr("Connecte-toi d'abord pour choisir un plan.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await createBillingCheckout(tenantId);
      if (typeof window !== "undefined") window.location.href = data.url;
    } catch (e) {
      const code = (e as { code?: string }).code;
      setErr(
        code === "billing_unavailable"
          ? "Le paiement n'est pas encore activé sur cette démo."
          : "Impossible d'ouvrir le paiement. Réessaie dans un instant.",
      );
      setBusy(false);
    }
  }

  const wrap = plan.highlighted
    ? "relative rounded-[12px] border-2 border-indigo-600 bg-white p-6 shadow-sm"
    : "okito-hairline relative rounded-[12px] bg-white p-6";

  return (
    <div className={wrap}>
      {plan.highlighted && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
          Recommandé
        </span>
      )}
      <div className="mb-1 text-sm font-medium text-slate-900">{plan.name}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="okito-num text-3xl font-medium text-slate-900">{price}</span>
        <span className="text-xs text-slate-500">{cadence}</span>
      </div>
      {plan.id === "pro" && (
        <div className="mt-1 text-[11px] font-medium text-emerald-700">
          ROI moyen · 12h/sem gagnées ≈ 400€
        </div>
      )}
      <p className="mt-2 text-[12px] text-slate-600">{plan.pitch}</p>

      <ul className="my-5 space-y-2 text-[13px] text-slate-700">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span
              className="ti ti-check mt-0.5 shrink-0 text-[14px] text-indigo-600"
              aria-hidden="true"
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSubscribe}
        disabled={busy}
        className={
          plan.highlighted
            ? "w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            : "okito-hairline w-full rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
        }
      >
        {busy ? "Redirection…" : plan.cta}
      </button>
      {err && <p className="mt-2 text-[11px] text-rose-700">{err}</p>}
    </div>
  );
}

function FAQ() {
  const items = [
    {
      q: "Est-ce que je peux résilier quand je veux ?",
      a: "Oui, sans frais et en un clic depuis la page Facturation. L'abonnement court jusqu'à la fin du mois payé.",
    },
    {
      q: "Comment se passe le paiement ?",
      a: "Le paiement est géré par Stripe (CB, Apple Pay, Google Pay). OKITO ne stocke aucune donnée bancaire.",
    },
    {
      q: "Puis-je changer de plan en cours de route ?",
      a: "Oui — le prorata est calculé automatiquement à chaque changement.",
    },
    {
      q: "Besoin d'une facture au nom de ma société ?",
      a: "Une facture PDF est générée automatiquement chaque mois et disponible dans la page Facturation.",
    },
  ];
  return (
    <div className="mx-auto mt-16 max-w-2xl">
      <h2 className="mb-4 text-center text-lg font-medium text-slate-900">Questions fréquentes</h2>
      <div className="okito-hairline divide-y divide-slate-100 rounded-[12px] bg-white">
        {items.map((it) => (
          <details key={it.q} className="group px-4 py-3">
            <summary className="flex cursor-pointer items-center text-sm font-medium text-slate-800">
              {it.q}
              <span
                className="ti ti-chevron-down ml-auto text-[14px] text-slate-400 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="pt-2 text-[13px] text-slate-600">{it.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 text-center text-[12px] text-slate-500">
        Une question spécifique ?{" "}
        <Link href="/jarvis" className="text-indigo-600 hover:underline">
          Demande à Jarvis
        </Link>
        .
      </p>
    </div>
  );
}
