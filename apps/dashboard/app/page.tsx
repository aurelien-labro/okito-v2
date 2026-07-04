"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "./_components/login-gate";
import {
  type HealthStatus,
  type JarvisAction,
  type JarvisBrief,
  type ReviewSummary,
  getCurrentTenantId,
  getHealth,
  getJarvisBrief,
  getReviewSummary,
  listJarvisActions,
  listReservations,
  regenerateJarvisBrief,
} from "./_lib/api-client";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function OverviewPage() {
  return (
    <LoginGate>
      <Overview />
    </LoginGate>
  );
}

function Overview() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vue globale</h1>
        <p className="mt-1 text-sm text-stone-500">
          Ce que Jarvis a fait, ce qui t&apos;attend, et l&apos;état de ton commerce en un coup
          d&apos;œil.
        </p>
      </div>
      <BriefBanner />
      <Indicators />
      <RecentActions />
      <SystemStatus />
    </div>
  );
}

function BriefBanner() {
  const [brief, setBrief] = useState<JarvisBrief | null>(null);
  const [state, setState] = useState<"loading" | "empty" | "ready" | "unavailable">("loading");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    try {
      const res = await getJarvisBrief(tenantId);
      setBrief(res.data);
      setState("ready");
    } catch (e) {
      setState((e as { status?: number }).status === 404 ? "empty" : "unavailable");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function regenerate() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBusy(true);
    try {
      const res = await regenerateJarvisBrief(tenantId);
      setBrief(res.data);
      setState("ready");
    } catch (e) {
      setState((e as { code?: string }).code === "advisor_unavailable" ? "unavailable" : "empty");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="ti ti-sparkles text-lg text-indigo-700" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-indigo-900">Brief de Jarvis</h2>
        <span className="ml-auto rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
          Mode auto actif
        </span>
      </div>

      {state === "ready" && brief ? (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{brief.text}</p>
          <div className="mt-3 flex items-center gap-3 text-xs text-indigo-700">
            <Link href="/jarvis" className="font-medium hover:underline">
              Ouvrir Jarvis →
            </Link>
            {typeof brief.pendingApprovals === "number" && brief.pendingApprovals > 0 && (
              <span>{brief.pendingApprovals} action(s) attendent ta validation</span>
            )}
          </div>
        </>
      ) : state === "unavailable" ? (
        <p className="text-sm text-stone-600">
          Le brief nécessite un LLM configuré côté API (variable <code>GEMINI_API_KEY</code>).
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <p className="text-sm text-stone-600">
            {state === "loading"
              ? "Chargement du brief…"
              : "Aucun brief pour l'instant — il arrive chaque matin à 8h."}
          </p>
          {state !== "loading" && (
            <button
              type="button"
              onClick={regenerate}
              disabled={busy}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Génération…" : "Faire le point maintenant"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Indicators() {
  const [reservations, setReservations] = useState<number | null>(null);
  const [reviews, setReviews] = useState<ReviewSummary | null>(null);
  const [jarvisDone, setJarvisDone] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    listReservations(todayIso())
      .then((r) => setReservations(r.data.length))
      .catch(() => setReservations(null));
    getReviewSummary(tenantId)
      .then((r) => setReviews(r.data))
      .catch(() => setReviews(null));
    listJarvisActions(tenantId, "executed")
      .then((r) => setJarvisDone(r.data.length))
      .catch(() => setJarvisDone(null));
    listJarvisActions(tenantId, "awaiting_approval")
      .then((r) => setPending(r.data.length))
      .catch(() => setPending(null));
  }, []);

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric
        href="/reservations"
        label="Réservations aujourd'hui"
        value={reservations === null ? "—" : String(reservations)}
      />
      <Metric
        href="/loyalty"
        label="Note Google"
        value={reviews && reviews.count > 0 ? `${reviews.average} ★` : "—"}
        hint={reviews ? `${reviews.count} avis` : undefined}
      />
      <Metric
        href="/jarvis"
        label="Actions faites par Jarvis"
        value={jarvisDone === null ? "—" : String(jarvisDone)}
      />
      <Metric
        href="/jarvis"
        label="En attente de validation"
        value={pending === null ? "—" : String(pending)}
        warn={(pending ?? 0) > 0}
      />
    </section>
  );
}

function Metric({
  href,
  label,
  value,
  hint,
  warn,
}: {
  href: string;
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <Link href={href} className="rounded-lg bg-stone-50 p-4 transition hover:bg-stone-100">
      <div className="flex items-center text-xs text-stone-500">
        {label}
        <span className="ti ti-arrow-up-right ml-auto text-xs" aria-hidden="true" />
      </div>
      <div className={`mt-1 text-2xl font-medium ${warn ? "text-amber-700" : "text-stone-900"}`}>
        {value}
      </div>
      {hint && <div className="text-xs text-stone-400">{hint}</div>}
    </Link>
  );
}

function RecentActions() {
  const [actions, setActions] = useState<JarvisAction[] | null>(null);

  useEffect(() => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    listJarvisActions(tenantId)
      .then((r) => setActions([...r.data].reverse().slice(0, 6)))
      .catch(() => setActions([]));
  }, []);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="ti ti-checklist text-base text-stone-500" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Jarvis a agi pour toi</h2>
        <Link href="/jarvis" className="ml-auto text-xs text-stone-500 hover:underline">
          Tout voir
        </Link>
      </div>
      {actions === null ? (
        <p className="text-sm text-stone-400">Chargement…</p>
      ) : actions.length === 0 ? (
        <p className="text-sm text-stone-400">
          Rien pour l&apos;instant. Jarvis proposera des actions dès qu&apos;il aura matière à agir.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {actions.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{a.summary}</span>
              <ActionBadge status={a.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionBadge({ status }: { status: JarvisAction["status"] }) {
  const map: Record<JarvisAction["status"], { label: string; cls: string }> = {
    awaiting_approval: { label: "À valider", cls: "bg-amber-100 text-amber-800" },
    scheduled: { label: "Programmée", cls: "bg-blue-100 text-blue-800" },
    executed: { label: "Faite", cls: "bg-emerald-100 text-emerald-800" },
    cancelled: { label: "Annulée", cls: "bg-stone-200 text-stone-700" },
    failed: { label: "Échouée", cls: "bg-rose-100 text-rose-800" },
  };
  const { label, cls } = map[status];
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function SystemStatus() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const dot = (ok?: boolean) => (ok ? "bg-emerald-500" : health ? "bg-rose-500" : "bg-stone-300");

  return (
    <section className="rounded-lg border border-stone-200 bg-white px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-600">
        <span className="font-medium text-stone-500">État système</span>
        <Dot cls={dot(health?.status === "ok")} label="API" />
        <Dot cls={dot(health?.llm.status === "ok")} label={`LLM ${health?.llm.model ?? ""}`} />
        <Dot cls={dot(health?.db.status === "ok")} label="Base de données" />
        <Dot cls={dot(health?.notifiers?.email.status === "configured")} label="Email" />
        <Dot cls={dot(health?.notifiers?.whatsapp.status === "configured")} label="WhatsApp" />
      </div>
    </section>
  );
}

function Dot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
}
