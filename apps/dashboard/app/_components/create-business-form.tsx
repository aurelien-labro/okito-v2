"use client";

import { type FormEvent, useState } from "react";
import { bootstrapTenant, setCurrentTenantId } from "../_lib/api-client";
import { getSupabase } from "../_lib/supabase";

const INDUSTRIES: { value: string; label: string }[] = [
  { value: "restaurant", label: "Restaurant / café" },
  { value: "hotel", label: "Hôtel / hébergement" },
  { value: "garage", label: "Garage / auto" },
  { value: "beauty", label: "Salon / bien-être" },
  { value: "realestate", label: "Immobilier" },
  { value: "rental", label: "Location" },
  { value: "generic", label: "Autre commerce" },
];

/**
 * Premier écran d'un nouvel inscrit : il a une session valide mais aucun
 * établissement. Un nom + un secteur → bootstrapTenant crée le tenant et la
 * membership owner, on pose le claim tenant_id dans les user_metadata
 * Supabase, puis reload pour entrer dans le cockpit.
 */
export function CreateBusinessForm({ onCreated }: { onCreated?: () => void }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("restaurant");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setErr("Donne un nom à ton commerce (2 caractères minimum).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { data } = await bootstrapTenant({ name: name.trim(), industry });
      setCurrentTenantId(data.id);
      // Pose le claim pour les prochains JWT (les requêtes passent déjà via
      // X-Tenant-Id + membership, ceci est une ceinture supplémentaire).
      try {
        const sb = getSupabase();
        await sb.auth.updateUser({ data: { tenant_id: data.id } });
        await sb.auth.refreshSession();
      } catch {
        // non bloquant
      }
      if (onCreated) onCreated();
      else window.location.assign("/app");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Impossible de créer l'établissement.");
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade-up">
      <div className="mb-6 text-center">
        <div className="okito-brand-mark anim-scale-in mx-auto mb-3 flex size-9 items-center justify-center rounded-lg text-[14px] font-medium text-white">
          O
        </div>
        <h2 className="okito-display text-2xl text-slate-900">Bienvenue chez OKITO</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Dernière étape : dis-nous pour quel commerce Jarvis va travailler.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="text"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de ton commerce (ex. Chez Léa)"
          className="okito-hairline w-full rounded-md bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-indigo-400"
        />
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="okito-hairline w-full rounded-md bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-indigo-400"
        >
          {INDUSTRIES.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="okito-hover w-full rounded-md bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="ti ti-loader-2 animate-spin text-[13px]" aria-hidden="true" />
              Création…
            </span>
          ) : (
            "Créer mon espace"
          )}
        </button>
        {err && (
          <div className="okito-hairline anim-fade-up rounded-md bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            {err}
          </div>
        )}
      </form>

      <p className="mt-6 text-center text-[11px] text-slate-400">
        Tu pourras connecter Google, ta boîte mail et le reste juste après.
      </p>
    </div>
  );
}
