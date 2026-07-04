"use client";

import { useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type OnboardingDiagnostic,
  getCurrentTenantId,
  runOnboardingDiagnostic,
} from "../_lib/api-client";

export default function OnboardingPage() {
  return (
    <LoginGate>
      <OnboardingView />
    </LoginGate>
  );
}

function OnboardingView() {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [businessQuery, setBusinessQuery] = useState("");
  const [diag, setDiag] = useState<OnboardingDiagnostic | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleRun() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      setErr("Aucun tenant sélectionné.");
      return;
    }
    if (!websiteUrl.trim() && !businessQuery.trim()) {
      setErr("Renseigne au moins le site ou le nom du commerce.");
      return;
    }
    setRunning(true);
    setErr(null);
    setDiag(null);
    try {
      const res = await runOnboardingDiagnostic(tenantId, {
        ...(websiteUrl.trim() ? { websiteUrl: websiteUrl.trim() } : {}),
        ...(businessQuery.trim() ? { businessQuery: businessQuery.trim() } : {}),
      });
      setDiag(res.data);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setErr(
        code === "unsafe_url"
          ? "Cette URL n'est pas valide ou pointe vers une adresse interne."
          : e instanceof Error
            ? e.message
            : "Le diagnostic a échoué.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Premier diagnostic</h1>
        <p className="mt-2 text-sm text-stone-500">
          Donne à Jarvis ton site et/ou le nom de ton commerce : il scanne tout et te dit par quoi
          commencer. 30 secondes.
        </p>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium" htmlFor="onboarding-site">
          Ton site web
        </label>
        <input
          id="onboarding-site"
          type="text"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="chezmarcel.fr"
          className="mb-4 w-full rounded border border-stone-300 px-3 py-2 text-sm"
        />
        <label className="mb-1 block text-sm font-medium" htmlFor="onboarding-biz">
          Ton commerce sur Google
        </label>
        <input
          id="onboarding-biz"
          type="text"
          value={businessQuery}
          onChange={(e) => setBusinessQuery(e.target.value)}
          placeholder="Boulangerie Chez Marcel Lyon"
          className="mb-5 w-full rounded border border-stone-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="w-full rounded bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {running ? "Jarvis analyse ton commerce…" : "Lancer le diagnostic"}
        </button>
        {err && <p className="mt-3 text-sm text-rose-700">{err}</p>}
      </div>

      {diag && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-5">
            <h2 className="mb-2 text-sm font-semibold text-indigo-900">Le diagnostic de Jarvis</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
              {diag.text}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {diag.website && (
              <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
                <h3 className="mb-2 font-semibold">Ton site</h3>
                {diag.website.reachable ? (
                  <ul className="space-y-1 text-stone-600">
                    <li>
                      Temps de réponse :{" "}
                      <Verdict
                        ok={(diag.website.responseTimeMs ?? 0) < 3000}
                        label={`${diag.website.responseTimeMs} ms`}
                      />
                    </li>
                    <li>
                      HTTPS :{" "}
                      <Verdict ok={diag.website.https} label={diag.website.https ? "oui" : "non"} />
                    </li>
                    <li>
                      Adapté mobile :{" "}
                      <Verdict
                        ok={diag.website.hasViewportMeta}
                        label={diag.website.hasViewportMeta ? "oui" : "non"}
                      />
                    </li>
                    <li>
                      Description Google :{" "}
                      <Verdict
                        ok={Boolean(diag.website.metaDescription)}
                        label={diag.website.metaDescription ? "présente" : "absente"}
                      />
                    </li>
                  </ul>
                ) : (
                  <p className="text-rose-700">
                    Site injoignable{diag.website.error ? ` — ${diag.website.error}` : ""}
                  </p>
                )}
              </div>
            )}
            {diag.business && (
              <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
                <h3 className="mb-2 font-semibold">Ta fiche Google</h3>
                {diag.business.found ? (
                  <ul className="space-y-1 text-stone-600">
                    <li>
                      Note :{" "}
                      <Verdict
                        ok={(diag.business.rating ?? 0) >= 4.5}
                        label={`${diag.business.rating} ★`}
                      />
                    </li>
                    <li>
                      Avis :{" "}
                      <Verdict
                        ok={(diag.business.reviewCount ?? 0) >= 30}
                        label={`${diag.business.reviewCount}`}
                      />
                    </li>
                    <li className="text-xs text-stone-400">{diag.business.address}</li>
                  </ul>
                ) : (
                  <p className="text-stone-500">
                    Fiche introuvable{diag.business.error ? ` — ${diag.business.error}` : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Verdict({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
      {label}
    </span>
  );
}
