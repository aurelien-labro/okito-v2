"use client";

import { useEffect, useState } from "react";
import {
  type HealthStatus,
  type ReminderRunResult,
  getHealth,
  runReminders,
} from "./_lib/api-client";

export default function OverviewPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((e) => setErr(e instanceof Error ? e.message : "ping /health failed"));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Vue d'ensemble</h1>
      <p className="mt-1 text-sm text-stone-500">État du système OKITO en temps réel.</p>

      <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card title="API" status={health?.status} detail={health?.service ?? "—"} />
        <Card title="LLM" status={health?.llm.status} detail={health?.llm.model ?? "—"} />
        <Card
          title="Base de données"
          status={health?.db.status}
          detail={
            health?.db.latencyMs !== undefined
              ? `${health.db.latencyMs} ms`
              : (health?.db.error ?? "—")
          }
        />
        <Card
          title="Email (Resend)"
          status={health?.notifiers?.email.status}
          detail={health?.notifiers?.email.provider ?? "—"}
        />
        <Card
          title="WhatsApp (Twilio)"
          status={health?.notifiers?.whatsapp.status}
          detail={health?.notifiers?.whatsapp.provider ?? "—"}
        />
        <Card
          title="Voix (Vapi)"
          status={health?.voice?.vapi.status}
          detail={health?.voice?.vapi.assistantId?.slice(0, 8) ?? "—"}
        />
      </section>

      {err && (
        <div className="mt-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Impossible de joindre l'API : {err}
          <div className="mt-1 text-xs">
            Vérifie que l'API tourne sur <code>localhost:3001</code> ou définis{" "}
            <code>NEXT_PUBLIC_OKITO_API_URL</code>.
          </div>
        </div>
      )}

      <RemindersPanel />
    </div>
  );
}

function RemindersPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReminderRunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function trigger(dryRun: boolean) {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const out = await runReminders({ dryRun });
      setResult({ ...out, dryRun });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Échec déclenchement rappels");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 rounded-lg border border-stone-200 bg-white px-5 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Rappels J-1</h2>
          <p className="mt-1 text-xs text-stone-500">
            Cron prévu tous les matins. Tu peux déclencher manuellement pour tester (dry-run) ou
            rattraper.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => trigger(true)}
            disabled={busy}
            className="rounded border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-100 disabled:opacity-50"
          >
            Dry-run
          </button>
          <button
            type="button"
            onClick={() => trigger(false)}
            disabled={busy}
            className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? "…" : "Envoyer maintenant"}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {result.dryRun ? "Dry-run" : "Run"} : {result.candidatesFound} candidats, {result.sent}{" "}
          envoyés, {result.skipped} skip, {result.failed} échecs.
        </div>
      )}
      {err && (
        <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {err}
        </div>
      )}
    </section>
  );
}

function Card({
  title,
  status,
  detail,
}: {
  title: string;
  status?: string;
  detail?: string;
}) {
  const color =
    status === "ok" || status === "configured"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status === "error" || status === "degraded"
        ? "bg-red-50 text-red-800 border-red-200"
        : "bg-stone-50 text-stone-600 border-stone-200";
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-stone-500">{title}</div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {status ?? "..."}
        </span>
      </div>
      <div className="mt-2 text-sm text-stone-700">{detail}</div>
    </div>
  );
}
