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
  getIcalUrls,
  listReservations,
  statsForPhones,
} from "../_lib/api-client";
import { formatDuration, hhmmToMinutes } from "../_lib/format";
import { useToast } from "../_lib/toast";

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
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loyalty, setLoyalty] = useState<Record<string, CustomerStats>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<"list" | "agenda">("list");

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
      toast(`Échec annulation : ${e instanceof Error ? e.message : "erreur"}`, "error");
    }
  }

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Réservations</h1>
          <p className="mt-1 text-sm text-slate-500">Filtre par date — défaut : aujourd'hui.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded border border-slate-300 text-sm">
            <button
              type="button"
              onClick={() => setView("list")}
              className={
                view === "list"
                  ? "bg-slate-900 px-3 py-2 text-white"
                  : "px-3 py-2 hover:bg-slate-50"
              }
            >
              Liste
            </button>
            <button
              type="button"
              onClick={() => setView("agenda")}
              className={
                view === "agenda"
                  ? "bg-slate-900 px-3 py-2 text-white"
                  : "px-3 py-2 hover:bg-slate-50"
              }
            >
              Agenda
            </button>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={fetchData}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Recharger
          </button>
          <IcalButton />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
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

      {view === "agenda" ? (
        <AgendaView rows={rows} loading={loading} />
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Chargement…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Aucune réservation pour ce jour.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
                    <tr key={r.id} className="border-t border-slate-100">
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
                            <span className="text-[10px] text-slate-400">
                              {stats.visitCount}× déjà vu
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td className="text-slate-600">{r.customerPhone}</Td>
                      <Td>{r.couverts}</Td>
                      <Td>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-600">
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
                            className="text-xs text-slate-700 hover:underline"
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
      )}
    </div>
  );
}

const PX_PER_MIN = 1.2;
const DEFAULT_DURATION = 30;

/**
 * Assigne à chaque résa une "lane" (colonne) en évitant le chevauchement
 * temporel réel : deux résas qui se recouvrent ne partagent jamais une lane.
 * Retourne les lanes et le nombre total de colonnes utilisées.
 */
function packLanes(items: { start: number; end: number }[]): {
  lanes: number[];
  laneCount: number;
} {
  const laneEnds: number[] = [];
  const lanes = items.map((it) => {
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    return lane;
  });
  return { lanes, laneCount: Math.max(1, laneEnds.length) };
}

function AgendaView({ rows, loading }: { rows: Reservation[]; loading: boolean }) {
  const active = rows.filter((r) => r.status !== "cancelled");
  if (loading) {
    return (
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Chargement…
      </div>
    );
  }
  if (active.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Aucune réservation active pour ce jour.
      </div>
    );
  }

  const events = active
    .map((r) => {
      const start = hhmmToMinutes(r.heure);
      return { r, start, end: start + (r.durationMinutes ?? DEFAULT_DURATION) };
    })
    .sort((a, b) => a.start - b.start);

  // Plage dynamique : englobe la première et la dernière résa du jour (défaut 8h-24h).
  const earliest = Math.min(...events.map((e) => e.start));
  const latest = Math.max(...events.map((e) => e.end));
  const startHour = Math.min(8, Math.floor(earliest / 60));
  const endHour = Math.max(24, Math.ceil(latest / 60));
  const startMin = startHour * 60;
  const totalHeight = (endHour - startHour) * 60 * PX_PER_MIN;

  const { lanes, laneCount } = packLanes(events);
  const laneWidth = 100 / laneCount;

  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="relative flex" style={{ height: totalHeight }}>
        <div className="w-16 shrink-0 border-r border-slate-100">
          {hours.map((h) => (
            <div
              key={h}
              className="relative text-right text-[10px] text-slate-400"
              style={{ height: 60 * PX_PER_MIN }}
            >
              <span className="absolute -top-1.5 right-2">{String(h % 24).padStart(2, "0")}h</span>
            </div>
          ))}
        </div>
        <div className="relative flex-1">
          {hours.map((h) => (
            <div
              key={h}
              className="border-t border-slate-100"
              style={{ height: 60 * PX_PER_MIN }}
            />
          ))}
          {events.map((e, i) => {
            const top = (e.start - startMin) * PX_PER_MIN;
            const rawHeight = (e.end - e.start) * PX_PER_MIN;
            const height = Math.min(Math.max(18, rawHeight), totalHeight - top);
            const lane = lanes[i] ?? 0;
            return (
              <Link
                key={e.r.id}
                href={`/reservations/${e.r.id}`}
                className="absolute overflow-hidden rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs hover:bg-emerald-100"
                style={{
                  top,
                  height,
                  left: `${lane * laneWidth}%`,
                  width: `${laneWidth - 1}%`,
                }}
              >
                <div className="truncate font-medium text-emerald-900">
                  {e.r.heure.slice(0, 5)} · {e.r.customerName}
                </div>
                <div className="truncate text-emerald-700">
                  {e.r.couverts} p.
                  {e.r.durationMinutes ? ` · ${formatDuration(e.r.durationMinutes)}` : ""}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IcalButton() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBusy(true);
    try {
      const { data } = await getIcalUrls(tenantId);
      const detail = `Télécharger : ${data.httpsUrl}\n\nS'abonner (Google Agenda / Outlook / Apple) :\n${data.webcalUrl}`;
      if (confirm(`${detail}\n\nOK pour télécharger le fichier .ics maintenant ?`)) {
        window.location.href = data.httpsUrl;
      }
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : "Export iCal indisponible (ICAL_FEED_SECRET non configuré ?)",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
    >
      {busy ? "…" : "Exporter iCal"}
    </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nouvelle réservation</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-700"
          >
            Fermer
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-500">Nom *</span>
              <input
                required
                minLength={2}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-500">Téléphone *</span>
              <input
                type="tel"
                required
                minLength={6}
                maxLength={20}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-500">Date *</span>
              <input
                type="date"
                required
                value={dateReservation}
                onChange={(e) => setDateReservation(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-500">Heure *</span>
              <input
                type="time"
                required
                value={heure}
                onChange={(e) => setHeure(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-500">Couverts *</span>
              <input
                type="number"
                min={1}
                max={20}
                required
                value={couverts}
                onChange={(e) => setCouverts(Number(e.target.value))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-slate-500">Notes</span>
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergies, demandes spéciales…"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          {err && <div className="text-sm text-rose-700">{err}</div>}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy || !customerName.trim() || !customerPhone.trim()}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
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
        ? "bg-slate-100 text-slate-500 border-slate-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}
