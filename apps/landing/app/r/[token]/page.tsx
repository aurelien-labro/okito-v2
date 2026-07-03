"use client";

import { use, useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_OKITO_API_URL ?? "http://localhost:3001";

interface PortalReservation {
  tenantName: string;
  customerFirstName: string;
  phoneMasked: string;
  dateReservation: string;
  heure: string;
  couverts: number;
  durationMinutes: number | null;
  status: string;
}

export default function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PortalReservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editHeure, setEditHeure] = useState("");
  const [editCouverts, setEditCouverts] = useState(2);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_URL}/r/${token}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Lien invalide ou expiré");
      setData(body.data);
      setEditDate(body.data.dateReservation);
      setEditHeure(body.data.heure);
      setEditCouverts(body.data.couverts);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel() {
    if (!confirm("Annuler définitivement votre réservation ?")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${API_URL}/r/${token}/cancel`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Échec de l'annulation");
      setData(body.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${API_URL}/r/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateReservation: editDate,
          heure: editHeure,
          couverts: editCouverts,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Modification impossible");
      setData(body.data);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        {loading ? (
          <p className="text-center text-sm text-stone-500">Chargement…</p>
        ) : !data ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold">Lien invalide</h1>
            <p className="mt-2 text-sm text-stone-500">
              {err ?? "Cette réservation est introuvable."}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs uppercase tracking-widest text-stone-400">{data.tenantName}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">
              Bonjour {data.customerFirstName}
            </h1>

            {data.status === "cancelled" ? (
              <div className="mt-4 rounded border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                Votre réservation est annulée. Si vous changez d&apos;avis, contactez directement
                l&apos;établissement.
              </div>
            ) : (
              <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Réservation confirmée le <strong>{fmtDate(data.dateReservation)}</strong> à{" "}
                <strong>{data.heure}</strong> pour <strong>{data.couverts}</strong> personne
                {data.couverts > 1 ? "s" : ""}
                {data.durationMinutes ? ` (${data.durationMinutes} min)` : ""}.
              </div>
            )}

            <p className="mt-2 text-xs text-stone-400">Téléphone : {data.phoneMasked}</p>

            {err && (
              <div className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {err}
              </div>
            )}

            {data.status === "confirmed" && !editing && (
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex-1 rounded border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="flex-1 rounded border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  {busy ? "…" : "Annuler la résa"}
                </button>
              </div>
            )}

            {data.status === "confirmed" && editing && (
              <form onSubmit={handleUpdate} className="mt-6 space-y-3">
                <label className="block">
                  <span className="text-xs uppercase tracking-wide text-stone-500">Date</span>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-wide text-stone-500">Heure</span>
                  <input
                    type="time"
                    required
                    value={editHeure}
                    onChange={(e) => setEditHeure(e.target.value)}
                    className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-wide text-stone-500">Personnes</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={editCouverts}
                    onChange={(e) => setEditCouverts(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="flex-1 rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                  >
                    Retour
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
                  >
                    {busy ? "…" : "Confirmer"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
