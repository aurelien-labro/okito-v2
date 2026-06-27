"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import { type Reservation, cancelReservation, listReservations } from "../_lib/api-client";

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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await listReservations(date);
      setRows(res.data);
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
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
          >
            Recharger
          </button>
        </div>
      </header>

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
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-stone-100">
                  <Td className="font-medium">{r.heure.slice(0, 5)}</Td>
                  <Td>{r.customerName}</Td>
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
              ))}
            </tbody>
          </table>
        )}
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
