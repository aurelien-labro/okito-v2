"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type CustomerProfile,
  type CustomerStats,
  getCurrentTenantId,
  getCustomer360,
  listTopCustomers,
} from "../_lib/api-client";

export default function LoyaltyPage() {
  return (
    <LoginGate>
      <LoyaltyView />
    </LoginGate>
  );
}

function LoyaltyView() {
  const [rows, setRows] = useState<CustomerStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      setErr("Aucun tenant sélectionné.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await listTopCustomers(tenantId, 50);
      setRows(res.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const returning = rows.filter((r) => r.isReturning);
  const newcomers = rows.filter((r) => !r.isReturning);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fidélité</h1>
          <p className="mt-1 text-sm text-slate-500">
            Top clients par nombre de visites. Un client est marqué « habitué » à partir de 3
            réservations honorées.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Recharger
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <StatCard label="Habitués" value={returning.length} hint="3+ visites" />
        <StatCard label="Clients vus" value={rows.length} hint="cumulé" />
      </div>

      {err && (
        <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Aucun client encore. Les stats apparaissent à partir de la première réservation confirmée.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Rang</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Téléphone</th>
                <th className="px-4 py-2">Visites</th>
                <th className="px-4 py-2">Première</th>
                <th className="px-4 py-2">Dernière</th>
                <th className="px-4 py-2">Badge</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.customerPhone} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => setSelectedPhone(r.customerPhone)}
                      className="text-indigo-700 hover:underline"
                    >
                      {r.customerName}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.customerPhone}</td>
                  <td className="px-4 py-3 font-semibold">{r.visitCount}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(r.firstVisit)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(r.lastVisit)}</td>
                  <td className="px-4 py-3">
                    {r.isReturning ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        habitué
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        {newcomers.length} client·e·s ont visité 1 ou 2 fois (non affichés ici comme habitués).
      </p>

      {selectedPhone && (
        <CustomerDrawer phone={selectedPhone} onClose={() => setSelectedPhone(null)} />
      )}
    </div>
  );
}

const TIMELINE_ICON: Record<string, string> = {
  reservation: "ti-calendar",
  review: "ti-star",
  email: "ti-mail",
};

function CustomerDrawer({ phone, onClose }: { phone: string; onClose: () => void }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    getCustomer360(tenantId, phone)
      .then((r) => setProfile(r.data))
      .catch((e) => setErr(e instanceof Error ? e.message : "Chargement impossible"));
  }, [phone]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/30"
      />
      <div className="relative h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{profile?.name ?? "Client"}</h2>
            <p className="font-mono text-xs text-slate-400">{phone}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-slate-400 hover:text-slate-700"
          >
            <span className="ti ti-x text-lg" aria-hidden="true" />
          </button>
        </div>

        {err && <p className="text-sm text-rose-700">{err}</p>}

        {profile && (
          <>
            <div className="mb-5 grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Visites" value={String(profile.visitCount)} />
              <MiniStat label="Annulations" value={String(profile.cancelledCount)} />
              <MiniStat
                label="No-shows"
                value={String(profile.noShowCount)}
                warn={profile.noShowCount > 0}
              />
            </div>
            {profile.averageRating !== null && (
              <p className="mb-4 text-sm text-slate-600">
                Note moyenne : <span className="font-medium">{profile.averageRating} ★</span>
              </p>
            )}
            {profile.email && (
              <p className="mb-4 text-sm text-slate-600">
                <span className="ti ti-mail mr-1 text-sm" aria-hidden="true" />
                {profile.email}
              </p>
            )}

            <h3 className="mb-2 text-sm font-medium">Historique</h3>
            <div className="space-y-3">
              {profile.timeline.map((t, i) => (
                <div key={`${t.at}-${i}`} className="flex gap-3">
                  <span
                    className={`ti ${TIMELINE_ICON[t.kind] ?? "ti-point"} mt-0.5 text-[15px] text-slate-400`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{t.title}</div>
                    {t.detail && <div className="text-xs text-slate-500">{t.detail}</div>}
                    <div className="text-[11px] text-slate-400">
                      {new Date(t.at).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {!profile && !err && <p className="text-sm text-slate-400">Chargement…</p>}
      </div>
    </div>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-100/70 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-medium ${warn ? "text-rose-700" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-slate-400">{hint}</div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}
