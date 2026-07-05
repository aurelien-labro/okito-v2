"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "./_components/login-gate";
import {
  type JarvisAction,
  type JarvisBrief,
  type JarvisChatMessage,
  type ReviewSummary,
  type SiteAnalytics,
  chatWithJarvis,
  getCurrentTenantId,
  getJarvisBrief,
  getReviewSummary,
  getSiteAnalytics,
  listInvoices,
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
    <div className="mx-auto max-w-6xl space-y-4">
      <BriefBanner />
      <Indicators />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
        <RecentActions />
        <ChatPanel />
      </div>
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
    } catch {
      // Pas de brief encore (404) ou session/API indisponible : on invite juste
      // à générer. Le vrai cas "LLM absent" est détecté à la régénération.
      setState("empty");
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

  const pending = brief?.pendingApprovals ?? 0;

  return (
    <section
      className="rounded-xl border p-4"
      style={{ background: "#EEEDFE", borderColor: "#534AB7" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="ti ti-sparkles text-lg" style={{ color: "#3C3489" }} aria-hidden="true" />
        <h2 className="text-sm font-semibold" style={{ color: "#26215C" }}>
          Brief de Jarvis
        </h2>
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
          Mode auto actif
        </span>
        <button
          type="button"
          onClick={regenerate}
          disabled={busy}
          className="ml-auto rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Génération…" : "Refaire le point"}
        </button>
      </div>

      {state === "ready" && brief ? (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "#3C3489" }}>
            {brief.text}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/jarvis"
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
              style={{ border: "0.5px solid #AFA9EC" }}
            >
              <span className="ti ti-sparkles mr-1 text-[13px]" aria-hidden="true" />
              Ouvrir Jarvis
            </Link>
            {pending > 0 && (
              <Link
                href="/jarvis"
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-stone-50"
                style={{ border: "0.5px solid #EF9F27" }}
              >
                <span className="ti ti-alert-triangle mr-1 text-[13px]" aria-hidden="true" />
                {pending} action(s) à valider
              </Link>
            )}
          </div>
        </>
      ) : state === "unavailable" ? (
        <p className="text-sm" style={{ color: "#3C3489" }}>
          Le brief nécessite un LLM configuré côté API (variable <code>GEMINI_API_KEY</code>).
        </p>
      ) : (
        <p className="text-sm" style={{ color: "#3C3489" }}>
          {state === "loading"
            ? "Chargement du brief…"
            : "Aucun brief pour l'instant — clique sur « Refaire le point »."}
        </p>
      )}
    </section>
  );
}

function Indicators() {
  const [reservations, setReservations] = useState<number | null>(null);
  const [reviews, setReviews] = useState<ReviewSummary | null>(null);
  const [revenueCents, setRevenueCents] = useState<number | null>(null);
  const [visits, setVisits] = useState<SiteAnalytics | null>(null);

  useEffect(() => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    getSiteAnalytics(tenantId)
      .then((r) => setVisits(r.data))
      .catch(() => setVisits(null));
    listReservations(todayIso())
      .then((r) => setReservations(r.data.length))
      .catch(() => setReservations(null));
    getReviewSummary(tenantId)
      .then((r) => setReviews(r.data))
      .catch(() => setReviews(null));
    // Chiffre du jour = somme des factures encaissées aujourd'hui.
    listInvoices(tenantId, "paid")
      .then((r) => {
        const today = todayIso();
        const sum = r.data
          .filter((inv) => inv.paidAt?.slice(0, 10) === today)
          .reduce((acc, inv) => acc + inv.amountCents, 0);
        setRevenueCents(sum);
      })
      .catch(() => setRevenueCents(null));
  }, []);

  const revenue =
    revenueCents === null
      ? null
      : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
          revenueCents / 100,
        );

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric
        label="Chiffre du jour"
        value={revenue ?? "—"}
        sub={revenue ? "factures encaissées" : "bientôt"}
        muted={revenueCents === null}
        href="/admin"
      />
      <Metric
        label="Visites site"
        value={visits === null ? "—" : String(visits.today)}
        sub={visits === null ? "connecter le tracker" : `${visits.last7Days} sur 7 jours`}
        muted={visits === null}
        href="/integrations"
      />
      <Metric
        label="Réservations"
        value={reservations === null ? "—" : String(reservations)}
        sub="aujourd'hui"
        href="/reservations"
      />
      <Metric
        label="Note Google"
        value={reviews && reviews.count > 0 ? `${reviews.average} ★` : "—"}
        sub={reviews ? `${reviews.count} avis` : "bientôt"}
        muted={!reviews || reviews.count === 0}
        href="/loyalty"
      />
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  href,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  href: string;
  muted?: boolean;
}) {
  return (
    <Link href={href} className="rounded-lg bg-stone-100/70 p-3 transition hover:bg-stone-100">
      <div className="flex items-center text-[11px] text-stone-500">
        {label}
        <span className="ti ti-arrow-up-right ml-auto text-[11px]" aria-hidden="true" />
      </div>
      <div className="mt-1 text-xl font-medium text-stone-900">{value}</div>
      {sub && (
        <div className={`text-[11px] ${muted ? "text-stone-400" : "text-stone-500"}`}>{sub}</div>
      )}
    </Link>
  );
}

const ACTION_ICON: Record<string, string> = {
  "review.reply": "ti-star",
  "invoice.remind": "ti-file-invoice",
  "email.reply": "ti-mail",
  "reservation.confirm": "ti-calendar-check",
  "reminder.send": "ti-bell",
};

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
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="ti ti-checklist text-base text-stone-500" aria-hidden="true" />
        <h2 className="text-sm font-medium">Jarvis a agi pour toi</h2>
        <Link href="/jarvis" className="ml-auto text-xs text-stone-500 hover:underline">
          Tout voir
        </Link>
      </div>
      {actions === null ? (
        <p className="py-4 text-sm text-stone-400">Chargement…</p>
      ) : actions.length === 0 ? (
        <p className="py-4 text-sm text-stone-400">
          Rien pour l&apos;instant. Jarvis proposera des actions dès qu&apos;il aura matière à agir.
        </p>
      ) : (
        <div className="flex flex-col">
          {actions.map((a, i) => (
            <div
              key={a.id}
              className={`flex items-start gap-2.5 py-2 ${i < actions.length - 1 ? "border-b border-stone-100" : ""}`}
            >
              <span
                className={`ti ${ACTION_ICON[a.type] ?? "ti-point"} mt-0.5 text-[15px] text-stone-400`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{a.summary}</div>
                <div className="text-[11px] text-stone-400">{subtitle(a)}</div>
              </div>
              <ActionBadge status={a.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function subtitle(a: JarvisAction): string {
  if (a.status === "scheduled" && a.cancellableUntil) {
    const h = Math.max(
      0,
      Math.round((new Date(a.cancellableUntil).getTime() - Date.now()) / 3.6e6),
    );
    return `programmée · annulable ${h} h`;
  }
  if (a.status === "awaiting_approval") return "action sensible · non exécutée";
  const ref = a.executedAt ?? a.createdAt;
  return new Date(ref).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActionBadge({ status }: { status: JarvisAction["status"] }) {
  const map: Record<JarvisAction["status"], { label: string; cls: string }> = {
    awaiting_approval: { label: "À valider", cls: "bg-amber-100 text-amber-800" },
    scheduled: { label: "Programmée", cls: "bg-blue-100 text-blue-800" },
    executed: { label: "Fait", cls: "bg-emerald-100 text-emerald-800" },
    cancelled: { label: "Annulée", cls: "bg-stone-200 text-stone-700" },
    failed: { label: "Échouée", cls: "bg-rose-100 text-rose-800" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
  );
}

function ChatPanel() {
  const [messages, setMessages] = useState<JarvisChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    const tenantId = getCurrentTenantId();
    const q = input.trim();
    if (!tenantId || !q || sending) return;
    const next: JarvisChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setSending(true);
    setErr(null);
    try {
      const res = await chatWithJarvis(tenantId, next);
      setMessages([...next, { role: "model", content: res.data.reply }]);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setErr(code === "advisor_unavailable" ? "LLM non configuré." : "Jarvis n'a pas pu répondre.");
      setMessages(messages);
      setInput(q);
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      className="flex flex-col rounded-xl border bg-white p-4"
      style={{ borderColor: "#85B7EB" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="ti ti-sparkles text-base text-indigo-600" aria-hidden="true" />
        <h2 className="text-sm font-medium">Demander à Jarvis</h2>
      </div>

      <div className="mb-3 flex min-h-[160px] flex-1 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-[13px] text-stone-400">
            « Combien de résas cette semaine ? », « Des avis négatifs récents ? », « Qu&apos;est-ce
            que tu as fait aujourd&apos;hui ? »
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${i}-${m.role}`}
            className={
              m.role === "user"
                ? "ml-auto w-fit max-w-[88%] rounded-xl bg-stone-900 px-3 py-2 text-[13px] text-white"
                : "w-fit max-w-[94%] rounded-xl bg-stone-100 px-3 py-2 text-[13px] text-stone-800"
            }
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="w-fit rounded-xl bg-stone-100 px-3 py-2 text-[13px] text-stone-400">
            …
          </div>
        )}
      </div>

      {err && <p className="mb-2 text-[11px] text-rose-700">{err}</p>}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Pose ta question…"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-[13px]"
        />
        <button
          type="button"
          aria-label="Parler à Jarvis"
          title="Vocal — bientôt"
          className="flex items-center justify-center rounded-md border border-stone-300 px-2.5 py-1.5 text-stone-500 hover:bg-stone-50"
        >
          <span className="ti ti-microphone text-[15px]" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
