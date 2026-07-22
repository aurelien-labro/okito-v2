"use client";

import { useCallback, useEffect, useState } from "react";
import { type ApiError, type CoachPlan, generateCoachPlan } from "../_lib/api-client";
import { useTenantId } from "../_lib/tenant-context";

/**
 * Skill Coach v1 — plan de journée à la demande.
 *
 * Pas encore de cron ni de persistance : on appelle le POST au montage puis
 * via "Rejouer". Le stub est remplacé par un vrai layout qui sait afficher
 * un chargement, une erreur ("LLM absent" en dev sans clés) et un plan.
 */
export default function CoachPage() {
  const tenantId = useTenantId();
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await generateCoachPlan(tenantId);
      setPlan(data);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(
        apiErr?.code === "coach_unavailable"
          ? "Coach indisponible — la clé LLM n'est pas configurée sur cet environnement."
          : apiErr?.message || "Impossible de générer le plan pour le moment.",
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) void run();
  }, [tenantId, run]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="okito-hairline flex flex-col gap-5 rounded-[12px] bg-white p-6">
        <header className="flex items-center gap-3">
          <span
            className="ti ti-run flex h-10 w-10 items-center justify-center rounded-[12px] bg-indigo-50 text-[20px] text-indigo-600"
            aria-hidden="true"
          />
          <div className="flex-1">
            <h1 className="text-lg font-medium text-slate-900">Coach — plan de la journée</h1>
            <p className="text-xs text-slate-500">
              3 priorités concrètes, ancrées dans le journal des 24 dernières heures.
            </p>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={loading || !tenantId}
            className="rounded-[12px] border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "…" : "Rejouer"}
          </button>
        </header>

        {plan?.nudge && (
          <div
            className={`rounded-[12px] px-3 py-2 text-xs font-medium ${
              plan.nudge.urgent
                ? "border border-red-200 bg-red-50 text-red-700"
                : "border border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {plan.nudge.label}
          </div>
        )}

        {loading && !plan && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-[12px] bg-slate-100" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
            {error}
          </div>
        )}

        {plan && (
          <ol className="flex flex-col gap-3">
            {plan.priorities.map((p, i) => (
              <li
                key={`${i}-${p.text}`}
                className="flex gap-3 rounded-[12px] border border-slate-100 p-3"
              >
                <span className="font-mono text-xs text-indigo-600">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-900">{p.text}</span>
                  <span className="text-xs text-slate-500">{p.why}</span>
                </div>
              </li>
            ))}
          </ol>
        )}

        {plan && (
          <footer className="flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {plan.eventCount} événement{plan.eventCount > 1 ? "s" : ""} · {plan.pendingApprovals}{" "}
              action{plan.pendingApprovals > 1 ? "s" : ""} en attente
            </span>
            <span>{new Date(plan.generatedAt).toLocaleTimeString("fr-FR")}</span>
          </footer>
        )}
      </div>
    </div>
  );
}
