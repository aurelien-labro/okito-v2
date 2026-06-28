"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import { type CustomerStats, getCurrentTenantId, listTopCustomers } from "../_lib/api-client";

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
          <p className="mt-1 text-sm text-stone-500">
            Top clients par nombre de visites. Un client est marqué « habitué » à partir de 3
            réservations honorées.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
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
        <div className="rounded border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
          Aucun client encore. Les stats apparaissent à partir de la première réservation confirmée.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
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
                <tr key={r.customerPhone} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 text-stone-500">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{r.customerName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.customerPhone}</td>
                  <td className="px-4 py-3 font-semibold">{r.visitCount}</td>
                  <td className="px-4 py-3 text-stone-500">{fmtDate(r.firstVisit)}</td>
                  <td className="px-4 py-3 text-stone-500">{fmtDate(r.lastVisit)}</td>
                  <td className="px-4 py-3">
                    {r.isReturning ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        habitué
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-stone-400">
        {newcomers.length} client·e·s ont visité 1 ou 2 fois (non affichés ici comme habitués).
      </p>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded border border-stone-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-stone-400">{hint}</div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}
