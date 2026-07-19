"use client";

import { useState } from "react";
import {
  type ApiError,
  type SocialDraft,
  type SocialTone,
  draftSocialPost,
} from "../_lib/api-client";
import { useTenantId } from "../_lib/tenant-context";

const TONES: { value: SocialTone; label: string }[] = [
  { value: "chaleureux", label: "Chaleureux" },
  { value: "expert", label: "Expert" },
  { value: "malicieux", label: "Malicieux" },
];

/**
 * Skill Social v1 — drafter LLM.
 *
 * Le patron écrit une note libre, choisit un ton, Jarvis renvoie une légende +
 * hashtags + call-to-action à copier-coller. Pas de scheduler ni de connexion
 * Instagram/Facebook en v1 — la programmation multi-canal viendra ensuite.
 */
export default function SocialPage() {
  const tenantId = useTenantId();
  const [note, setNote] = useState("");
  const [tone, setTone] = useState<SocialTone>("chaleureux");
  const [draft, setDraft] = useState<SocialDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"caption" | "all" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !note.trim()) return;
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const { data } = await draftSocialPost(tenantId, { note, tone });
      setDraft(data);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(
        apiErr?.code === "social_unavailable"
          ? "Social indisponible — la clé LLM n'est pas configurée sur cet environnement."
          : apiErr?.message || "Impossible de générer le brouillon.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, kind: "caption" | "all") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard peut être refusé — l'utilisateur peut sélectionner à la main
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="okito-hairline flex flex-col gap-5 rounded-[12px] bg-white p-6">
        <header className="flex items-center gap-3">
          <span
            className="ti ti-brand-instagram flex h-10 w-10 items-center justify-center rounded-[12px] bg-indigo-50 text-[20px] text-indigo-600"
            aria-hidden="true"
          />
          <div className="flex-1">
            <h1 className="text-lg font-medium text-slate-900">Social — brouillon express</h1>
            <p className="text-xs text-slate-500">
              Une note, un ton, un post prêt à coller sur Insta, Facebook ou Google Business.
            </p>
          </div>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">Ta note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nouveau plat au menu ce soir : joue de bœuf confite, purée maison."
              rows={4}
              maxLength={2000}
              disabled={loading}
              className="rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Ton :</span>
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                disabled={loading}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  tone === t.value
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              type="submit"
              disabled={loading || !note.trim() || !tenantId}
              className="ml-auto rounded-[12px] bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Génération…" : "Générer"}
            </button>
          </div>
        </form>

        {error && (
          <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
            {error}
          </div>
        )}

        {draft && (
          <div className="flex flex-col gap-4 rounded-[12px] border border-slate-100 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Légende</span>
                <button
                  type="button"
                  onClick={() => copy(draft.caption, "caption")}
                  className="text-indigo-600 hover:text-indigo-500"
                >
                  {copied === "caption" ? "Copié ✓" : "Copier"}
                </button>
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-900">
                {draft.caption}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {draft.hashtags.map((h) => (
                <span
                  key={h}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                >
                  {h}
                </span>
              ))}
            </div>

            <div className="flex gap-2 text-xs">
              <span
                className="ti ti-target mt-0.5 text-[14px] text-indigo-500"
                aria-hidden="true"
              />
              <span className="text-slate-600">{draft.callToAction}</span>
            </div>

            {draft.warnings.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {draft.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => copy(`${draft.caption}\n\n${draft.hashtags.join(" ")}`, "all")}
              className="self-end rounded-[12px] border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {copied === "all" ? "Copié ✓" : "Copier légende + hashtags"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
