"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type WaitlistEntry,
  type WaitlistStatus,
  cancelWaitlistEntry,
  convertWaitlistEntry,
  expireWaitlistEntry,
  getCurrentTenantId,
  listWaitlist,
  notifyWaitlistEntry,
} from "../_lib/api-client";

const STATUS_LABEL: Record<WaitlistStatus, string> = {
  waiting: "En attente",
  notified: "Notifié",
  converted: "Converti",
  expired: "Expiré",
  cancelled: "Annulé",
};

const STATUS_COLOR: Record<WaitlistStatus, string> = {
  waiting: "bg-amber-100 text-amber-800",
  notified: "bg-blue-100 text-blue-800",
  converted: "bg-emerald-100 text-emerald-800",
  expired: "bg-slate-200 text-slate-700",
  cancelled: "bg-rose-100 text-rose-800",
};

export default function WaitlistPage() {
  return (
    <LoginGate>
      <WaitlistView />
    </LoginGate>
  );
}

function WaitlistView() {
  const [filter, setFilter] = useState<WaitlistStatus | "all">("waiting");
  const [rows, setRows] = useState<WaitlistEntry[]>([]);
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
      const res = await listWaitlist(tenantId, filter === "all" ? undefined : filter);
      setRows(res.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur chargement");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAction(action: "notify" | "convert" | "expire" | "cancel", id: string) {
    const fns = {
      notify: notifyWaitlistEntry,
      convert: convertWaitlistEntry,
      expire: expireWaitlistEntry,
      cancel: cancelWaitlistEntry,
    };
    try {
      await fns[action](id);
      await fetchData();
    } catch (e) {
      alert(`Action ${action} échouée : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Liste d&apos;attente</h1>
          <p className="mt-1 text-sm text-slate-500">
            Clients en attente d&apos;un créneau. Notifier quand une table se libère, marquer
            converti dès qu&apos;une résa est créée.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as WaitlistStatus | "all")}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="waiting">En attente</option>
            <option value="notified">Notifiés</option>
            <option value="converted">Convertis</option>
            <option value="expired">Expirés</option>
            <option value="cancelled">Annulés</option>
            <option value="all">Tous</option>
          </select>
          <button
            type="button"
            onClick={fetchData}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Recharger
          </button>
        </div>
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
          Aucune entrée.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Date / Heure</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Téléphone</th>
                <th className="px-4 py-2">Couverts</th>
                <th className="px-4 py-2">Flex</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Inscrit</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {fmtDate(r.dateSouhaitee)} · {r.heureSouhaitee.slice(0, 5)}
                  </td>
                  <td className="px-4 py-3">{r.customerName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.customerPhone}</td>
                  <td className="px-4 py-3">{r.couverts}</td>
                  <td className="px-4 py-3 text-slate-500">±{r.flexMinutes} min</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtRelative(r.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2 text-xs">
                      {r.status === "waiting" && (
                        <button
                          type="button"
                          onClick={() => handleAction("notify", r.id)}
                          className="text-blue-700 hover:underline"
                        >
                          Notifier
                        </button>
                      )}
                      {(r.status === "waiting" || r.status === "notified") && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleAction("convert", r.id)}
                            className="text-emerald-700 hover:underline"
                          >
                            Converti
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAction("expire", r.id)}
                            className="text-slate-500 hover:underline"
                          >
                            Expirer
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAction("cancel", r.id)}
                            className="text-rose-700 hover:underline"
                          >
                            Annuler
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `il y a ${diffD}j`;
}
