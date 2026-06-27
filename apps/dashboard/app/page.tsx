"use client";

import { useEffect, useState } from "react";
import { type HealthStatus, getHealth } from "./_lib/api-client";

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
    </div>
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
