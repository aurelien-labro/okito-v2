"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type ServiceCatalogItem,
  createServiceCatalogItem,
  deleteServiceCatalogItem,
  getCurrentTenantId,
  listServiceCatalog,
  updateServiceCatalogItem,
} from "../_lib/api-client";

export default function ServiceCatalogPage() {
  return (
    <LoginGate>
      <CatalogView />
    </LoginGate>
  );
}

function formatPrice(cents: number | null, currency: string): string {
  if (cents === null) return "—";
  const amount = (cents / 100).toFixed(2).replace(".", ",");
  return currency === "EUR" ? `${amount} €` : `${amount} ${currency}`;
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  if (min >= 1440 && min % 1440 === 0) {
    const days = min / 1440;
    return days === 1 ? "1 jour" : `${days} jours`;
  }
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, "0")}`;
}

function CatalogView() {
  const [rows, setRows] = useState<ServiceCatalogItem[]>([]);
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
      const res = await listServiceCatalog(tenantId, includeInactive);
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

  async function handleToggle(s: ServiceCatalogItem) {
    try {
      await updateServiceCatalogItem(s.id, { active: !s.active });
      await fetchData();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  async function handleDelete(s: ServiceCatalogItem) {
    if (!confirm(`Supprimer la prestation « ${s.name} » ?`)) return;
    try {
      await deleteServiceCatalogItem(s.id);
      await fetchData();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  const activeCount = rows.filter((r) => r.active).length;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prestations</h1>
          <p className="mt-1 text-sm text-stone-500">
            Catalogue de prestations proposées à la réservation : coupe, vidange, consultation,
            massage… Dès qu&apos;une prestation active existe, l&apos;assistant demande laquelle le
            client veut et note sa durée sur la réservation.
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">
            {activeCount} prestation{activeCount > 1 ? "s" : ""} active
            {activeCount > 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <NewServiceForm onCreated={fetchData} />

      <div className="mt-6 mb-3 flex items-center gap-3 text-sm text-stone-600">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-stone-300"
          />
          Inclure les prestations inactives
        </label>
        <button
          type="button"
          onClick={fetchData}
          className="ml-auto rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
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
        <div className="rounded border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
          Aucune prestation. Ajoute une prestation ci-dessus pour que l&apos;assistant la propose.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2">Prestation</th>
                <th className="px-4 py-2">Durée</th>
                <th className="px-4 py-2">Prix</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    {r.description && <div className="text-xs text-stone-500">{r.description}</div>}
                  </td>
                  <td className="px-4 py-3">{formatDuration(r.durationMinutes)}</td>
                  <td className="px-4 py-3">{formatPrice(r.priceCents, r.currency)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        r.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"
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

function NewServiceForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBusy(true);
    setErr(null);
    try {
      const priceCents = price.trim()
        ? Math.round(Number.parseFloat(price.replace(",", ".")) * 100)
        : null;
      if (priceCents !== null && (Number.isNaN(priceCents) || priceCents < 0)) {
        throw new Error("Prix invalide");
      }
      await createServiceCatalogItem(tenantId, {
        name: name.trim(),
        description: description.trim() || null,
        durationMinutes,
        priceCents,
      });
      setName("");
      setDescription("");
      setDurationMinutes(60);
      setPrice("");
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
      className="flex flex-wrap items-end gap-3 rounded border border-stone-200 bg-white px-4 py-3"
    >
      <label className="min-w-40 flex-1">
        <span className="text-xs uppercase tracking-wide text-stone-500">Nom</span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Coupe homme, Vidange, Consultation…"
          className="mt-1 w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
        />
      </label>
      <label className="min-w-40 flex-1">
        <span className="text-xs uppercase tracking-wide text-stone-500">Description</span>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optionnel"
          className="mt-1 w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
        />
      </label>
      <label className="w-32">
        <span className="text-xs uppercase tracking-wide text-stone-500">Durée (min)</span>
        <input
          type="number"
          min={5}
          max={10080}
          step={5}
          required
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
        />
      </label>
      <label className="w-28">
        <span className="text-xs uppercase tracking-wide text-stone-500">Prix (€)</span>
        <input
          type="text"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="—"
          className="mt-1 w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {busy ? "…" : "Ajouter"}
      </button>
      {err && <div className="ml-3 text-sm text-rose-700">{err}</div>}
    </form>
  );
}
