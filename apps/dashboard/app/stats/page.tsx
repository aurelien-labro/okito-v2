"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type ReviewSummary,
  type StatsOverview,
  type Tenant,
  getReviewSummary,
  getStatsOverview,
  listTenants,
} from "../_lib/api-client";

const RANGES = [
  { label: "7 jours", value: 7 },
  { label: "30 jours", value: 30 },
  { label: "90 jours", value: 90 },
  { label: "1 an", value: 365 },
];

export default function StatsPage() {
  return (
    <LoginGate>
      <StatsView />
    </LoginGate>
  );
}

function StatsView() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [reviews, setReviews] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listTenants()
      .then((res) => {
        setTenants(res.data);
        if (res.data[0]) setTenantId(res.data[0].id);
      })
      .catch((e) => setErr(extractMessage(e)));
  }, []);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await getStatsOverview(tenantId, days);
      setStats(res.data);
      getReviewSummary(tenantId)
        .then((r) => setReviews(r.data))
        .catch(() => setReviews(null));
    } catch (e) {
      setErr(extractMessage(e));
    } finally {
      setLoading(false);
    }
  }, [tenantId, days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Statistiques</h1>
          <p className="mt-1 text-sm text-slate-500">
            Vue d'ensemble business sur la période — résas, sources, créneaux populaires.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {err && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {loading || !stats ? (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          {loading ? "Chargement…" : "Aucune donnée"}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <KpiRow stats={stats} />
          <ChartCard title="Réservations par jour">
            <DayChart data={stats.byDay} />
          </ChartCard>
          <div className="grid gap-6 md:grid-cols-2">
            <ChartCard title="Par canal d'entrée">
              <SourceList data={stats.bySource} />
            </ChartCard>
            <ChartCard title="Top créneaux horaires">
              <HourList data={stats.byHour} />
            </ChartCard>
          </div>
          {reviews && reviews.count > 0 && (
            <ChartCard title="Avis clients">
              <ReviewsWidget reviews={reviews} />
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewsWidget({ reviews }: { reviews: ReviewSummary }) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <div className="text-3xl font-semibold tracking-tight">{reviews.average.toFixed(1)}</div>
        <div className="text-sm text-amber-500">
          {"★".repeat(Math.round(reviews.average))}
          <span className="text-slate-300">{"★".repeat(5 - Math.round(reviews.average))}</span>
        </div>
        <div className="text-xs text-slate-500">
          {reviews.count} avis{reviews.count > 1 ? "" : ""}
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {reviews.recent.map((r, i) => (
          <li
            key={`${r.submittedAt}-${i}`}
            className="rounded border border-slate-100 px-3 py-2 text-sm"
          >
            <span className="text-amber-500">{"★".repeat(r.rating)}</span>
            {r.comment && <span className="ml-2 text-slate-600">{r.comment}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KpiRow({ stats }: { stats: StatsOverview }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Kpi label="Total résas" value={String(stats.totals.reservations)} />
      <Kpi
        label="Confirmées"
        value={String(stats.totals.confirmed)}
        hint={`${stats.totals.completed} terminées`}
      />
      <Kpi
        label="Couverts (moy.)"
        value={stats.totals.couvertsAvg.toFixed(1)}
        hint={`${stats.totals.couvertsTotal} couverts total`}
      />
      <Kpi
        label="No-show"
        value={`${(stats.noShowRate * 100).toFixed(1)}%`}
        hint={`${stats.totals.noShow} no-shows sur la période`}
        warn={stats.noShowRate > 0.1}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-2 text-3xl font-semibold tracking-tight ${
          warn ? "text-red-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DayChart({ data }: { data: StatsOverview["byDay"] }) {
  if (data.length === 0) {
    return <div className="text-sm text-slate-500">Aucune résa sur la période.</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="space-y-1">
      {data.map((d) => {
        const pct = Math.round((d.total / max) * 100);
        const confirmedPct = d.total > 0 ? Math.round((d.confirmed / d.total) * pct) : 0;
        return (
          <div key={d.date} className="flex items-center gap-3 text-xs">
            <span className="w-24 shrink-0 text-slate-500">{fmtDate(d.date)}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
              <div
                className="absolute inset-y-0 left-0 bg-slate-300"
                style={{ width: `${pct}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500"
                style={{ width: `${confirmedPct}%` }}
              />
            </div>
            <span className="w-16 text-right font-medium tabular-nums">{d.total}</span>
          </div>
        );
      })}
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <Legend color="bg-emerald-500" label="Confirmées" />
        <Legend color="bg-slate-300" label="Annulées / autres" />
      </div>
    </div>
  );
}

function SourceList({ data }: { data: StatsOverview["bySource"] }) {
  if (data.length === 0) return <div className="text-sm text-slate-500">Aucune donnée.</div>;
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
        return (
          <div key={d.source}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="uppercase tracking-wide text-slate-600">
                {SOURCE_LABEL[d.source] ?? d.source}
              </span>
              <span className="font-medium tabular-nums">
                {d.count} <span className="text-slate-400">({pct}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-100">
              <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HourList({ data }: { data: StatsOverview["byHour"] }) {
  if (data.length === 0) return <div className="text-sm text-slate-500">Aucune donnée.</div>;
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const pct = Math.round((d.count / max) * 100);
        return (
          <div key={d.hour} className="flex items-center gap-3 text-xs">
            <span className="w-12 shrink-0 font-medium tabular-nums">{d.hour.slice(0, 5)}</span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
              <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-10 text-right tabular-nums">{d.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  web_widget: "Widget web",
  whatsapp: "WhatsApp",
  voice: "Voix",
  manual: "Manuel",
  unknown: "Inconnu",
};

function fmtDate(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function extractMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Erreur inconnue";
}
