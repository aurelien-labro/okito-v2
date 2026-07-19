"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type TenantTable,
  createTable,
  deleteTable,
  getCurrentTenantId,
  listTables,
  updateTable,
} from "../_lib/api-client";

export default function TablesPage() {
  return (
    <LoginGate>
      <TablesView />
    </LoginGate>
  );
}

function TablesView() {
  const [rows, setRows] = useState<TenantTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  const fetchData = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      setErr("Aucun tenant sélectionné.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await listTables(tenantId, includeInactive);
      setRows(res.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur chargement");
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleToggle(t: TenantTable) {
    try {
      await updateTable(t.id, { active: !t.active });
      await fetchData();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  async function handleDelete(t: TenantTable) {
    if (!confirm(`Supprimer la table ${t.label} ?`)) return;
    try {
      await deleteTable(t.id);
      await fetchData();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  const totalSeats = rows.filter((r) => r.active).reduce((sum, r) => sum + r.capacity, 0);
  const activeCount = rows.filter((r) => r.active).length;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tables</h1>
          <p className="mt-1 text-sm text-slate-500">
            Inventaire de tables : la capacité par table remplace le plafond global. Dès qu&apos;au
            moins une table active existe, le bot cherche la plus petite table libre pour chaque
            demande.
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">
            {activeCount} table{activeCount > 1 ? "s" : ""} active
            {activeCount > 1 ? "s" : ""}
          </div>
          <div className="text-slate-500">{totalSeats} couverts total</div>
        </div>
      </div>

      <NewTableForm onCreated={fetchData} />

      <div className="mt-6 mb-3 flex items-center gap-3 text-sm text-slate-600">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-slate-300"
          />
          Inclure les tables inactives
        </label>
        <button
          type="button"
          onClick={fetchData}
          className="ml-auto rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Recharger
        </button>
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
          Aucune table. Ajoute une table ci-dessus pour activer le mode capacité-par-table.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2">Couverts</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{r.label}</td>
                  <td className="px-4 py-3">{r.capacity}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        r.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {r.active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggle(r)}
                        className="text-blue-700 hover:underline"
                      >
                        {r.active ? "Désactiver" : "Activer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        className="text-rose-700 hover:underline"
                      >
                        Supprimer
                      </button>
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

function NewTableForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [capacity, setCapacity] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBusy(true);
    setErr(null);
    try {
      await createTable({ tenantId, label: label.trim(), capacity });
      setLabel("");
      setCapacity(2);
      await onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur création");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-3 rounded border border-slate-200 bg-white px-4 py-3"
    >
      <label className="flex-1">
        <span className="text-xs uppercase tracking-wide text-slate-500">Label</span>
        <input
          type="text"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="T1, Salle, Comptoir…"
          className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
      </label>
      <label className="w-32">
        <span className="text-xs uppercase tracking-wide text-slate-500">Couverts</span>
        <input
          type="number"
          min={1}
          max={30}
          required
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !label.trim()}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? "…" : "Ajouter"}
      </button>
      {err && <div className="ml-3 text-sm text-rose-700">{err}</div>}
    </form>
  );
}
