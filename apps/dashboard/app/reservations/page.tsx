"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type CustomerStats,
  type Reservation,
  cancelReservation,
  createReservation,
  getCurrentTenantId,
  listReservations,
  statsForPhones,
} from "../_lib/api-client";

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ReservationsPage() {
  return (
    <LoginGate>
      <ReservationsList />
    </LoginGate>
  );
}

function ReservationsList() {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loyalty, setLoyalty] = useState<Record<string, CustomerStats>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await listReservations(date);
      setRows(res.data);

      // Enrich avec stats fidélité (best-effort, n'empêche pas l'affichage si échoue).
      const tenantId = getCurrentTenantId();
      const phones = Array.from(new Set(res.data.map((r) => r.customerPhone))).filter(Boolean);
      if (tenantId && phones.length > 0) {
        try {
          const stats = await statsForPhones(tenantId, phones);
          const map: Record<string, CustomerStats> = {};
          for (const s of stats.data) map[s.customerPhone] = s;
          setLoyalty(map);
        } catch {
          setLoyalty({});
        }
      } else {
        setLoyalty({});
      }
    } catch (e) {
      const msg =
        e && typeof e === "object" && "message" in e ? String(e.message) : "Erreur inconnue";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCancel(id: string) {
    if (!confirm("Annuler cette réservation ?")) return;
    try {
      await cancelReservation(id);
      fetchData();
    } catch (e) {
      alert(`Échec annulation : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Réservations</h1>
          <p className="mt-1 text-sm text-stone-500">Filtre par date — défaut : aujourd'hui.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={fetchData}
            className="rounded border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
          >
            Recharger
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
          >
            + Nouvelle résa
          </button>
        </div>
      </header>

      {showCreate && (
        <CreateModal
          defaultDate={date}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchData();
          }}
        />
      )}

      {err && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-stone-500">Chargement…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-stone-500">
            Aucune réservation pour ce jour.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <Th>Heure</Th>
                <Th>Client</Th>
                <Th>Téléphone</Th>
                <Th>Couverts</Th>
                <Th>Source</Th>
                <Th>Statut</Th>
                <Th>—</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stats = loyalty[r.customerPhone];
                return (
                  <tr key={r.id} className="border-t border-stone-100">
                    <Td className="font-medium">{r.heure.slice(0, 5)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span>{r.customerName}</span>
                        {stats?.isReturning && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                            habitué · {stats.visitCount}
                          </span>
                        )}
                        {stats && !stats.isReturning && stats.visitCount >= 2 && (
                          <span className="text-[10px] text-stone-400">
                            {stats.visitCount}× déjà vu
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="text-stone-600">{r.customerPhone}</Td>
                    <Td>{r.couverts}</Td>
                    <Td>
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-xs uppercase tracking-wide text-stone-600">
                        {r.source}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/reservations/${r.id}`}
                          className="text-xs text-stone-700 hover:underline"
                        >
                          Éditer
                        </Link>
                        {r.status !== "cancelled" && (
                          <button
                            type="button"
                            onClick={() => handleCancel(r.id)}
                            className="text-xs text-red-700 hover:underline"
                          >
                            Annuler
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CreateModal({
  defaultDate,
  onClose,
  onCreated,
}: {
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [couverts, setCouverts] = useState(2);
  const [dateReservation, setDateReservation] = useState(defaultDate);
  const [heure, setHeure] = useState("20:00");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await createReservation({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        couverts,
        dateReservation,
        heure,
        notes: notes.trim() || undefined,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur création");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nouvelle réservation</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-stone-400 hover:text-stone-700"
          >
            Fermer
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-stone-500">Nom *</span>
              <input
                required
                minLength={2}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-stone-500">Téléphone *</span>
              <input
                type="tel"
                required
                minLength={6}
                maxLength={20}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-stone-500">Date *</span>
              <input
                type="date"
                required
                value={dateReservation}
                onChange={(e) => setDateReservation(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-stone-500">Heure *</span>
              <input
                type="time"
                required
                value={heure}
                onChange={(e) => setHeure(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-stone-500">Couverts *</span>
              <input
                type="number"
                min={1}
                max={20}
                required
                value={couverts}
                onChange={(e) => setCouverts(Number(e.target.value))}
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-stone-500">Notes</span>
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergies, demandes spéciales…"
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          {err && <div className="text-sm text-rose-700">{err}</div>}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy || !customerName.trim() || !customerPhone.trim()}
              className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {busy ? "Création…" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "confirmed"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status === "cancelled"
        ? "bg-stone-100 text-stone-500 border-stone-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}
