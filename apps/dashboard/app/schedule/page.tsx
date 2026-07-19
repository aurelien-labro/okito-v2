"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type ScheduleRule,
  type ScheduleRuleKind,
  createScheduleRule,
  deleteScheduleRule,
  getCurrentTenantId,
  listScheduleRules,
  setScheduleRuleActive,
} from "../_lib/api-client";

const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default function SchedulePage() {
  return (
    <LoginGate>
      <ScheduleView />
    </LoginGate>
  );
}

function describeRule(r: ScheduleRule): string {
  if (r.kind === "weekly_closed") {
    const days = (r.payload.weekdays ?? []).map((d) => WEEKDAYS[d] ?? `jour ${d}`).join(", ");
    return `Fermé chaque ${days}`;
  }
  if (r.kind === "date_closed") {
    if (r.payload.date) return `Fermé le ${fmtDate(r.payload.date)}`;
    return `Fermé du ${fmtDate(r.payload.from ?? "")} au ${fmtDate(r.payload.to ?? "")}`;
  }
  const services = (r.payload.services ?? [])
    .map((s) => `${s.label} ${s.start}–${s.end}`)
    .join(", ");
  return `Horaires spéciaux le ${fmtDate(r.payload.date ?? "")} : ${services}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

const KIND_LABELS: Record<ScheduleRuleKind, string> = {
  weekly_closed: "Fermeture hebdo",
  date_closed: "Congés / jour fermé",
  date_special: "Horaires spéciaux",
};

function ScheduleView() {
  const [rows, setRows] = useState<ScheduleRule[]>([]);
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
      const res = await listScheduleRules(tenantId, true);
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

  async function handleToggle(r: ScheduleRule) {
    try {
      await setScheduleRuleActive(r.id, !r.active);
      await fetchData();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  async function handleDelete(r: ScheduleRule) {
    if (!confirm("Supprimer cette règle ?")) return;
    try {
      await deleteScheduleRule(r.id);
      await fetchData();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Horaires & fermetures</h1>
        <p className="mt-1 text-sm text-slate-500">
          Jours de fermeture hebdomadaire, congés et horaires exceptionnels. L&apos;assistant refuse
          automatiquement les réservations sur les jours fermés — les horaires spéciaux priment sur
          tout (utile pour ouvrir un jour férié).
        </p>
      </div>

      <NewRuleForm onCreated={fetchData} />

      {err && (
        <div className="my-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      )}

      <div className="mt-6">
        {loading && rows.length === 0 ? (
          <div className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Chargement…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Aucune règle. L&apos;établissement suit ses horaires normaux 7j/7.
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Règle</th>
                  <th className="px-4 py-2">Statut</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                      {KIND_LABELS[r.kind]}
                    </td>
                    <td className="px-4 py-3">{describeRule(r)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          r.active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
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
    </div>
  );
}

function NewRuleForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [kind, setKind] = useState<ScheduleRuleKind>("weekly_closed");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState(false);
  const [specialLabel, setSpecialLabel] = useState("Horaires spéciaux");
  const [specialStart, setSpecialStart] = useState("10:00");
  const [specialEnd, setSpecialEnd] = useState("16:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleWeekday(d: number) {
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBusy(true);
    setErr(null);
    try {
      if (kind === "weekly_closed") {
        if (weekdays.length === 0) throw new Error("Choisir au moins un jour");
        await createScheduleRule(tenantId, { kind, payload: { weekdays } });
        setWeekdays([]);
      } else if (kind === "date_closed") {
        const payload = range ? { from, to } : { date };
        await createScheduleRule(tenantId, { kind, payload });
        setDate("");
        setFrom("");
        setTo("");
      } else {
        await createScheduleRule(tenantId, {
          kind,
          payload: {
            date,
            services: [{ label: specialLabel, start: specialStart, end: specialEnd }],
          },
        });
        setDate("");
      }
      await onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur création");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="text-xs uppercase tracking-wide text-slate-500">Type de règle</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ScheduleRuleKind)}
            className="mt-1 block rounded border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="weekly_closed">Fermeture hebdo</option>
            <option value="date_closed">Congés / jour fermé</option>
            <option value="date_special">Horaires spéciaux</option>
          </select>
        </label>

        {kind === "weekly_closed" && (
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((label, d) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleWeekday(d)}
                className={`rounded border px-3 py-1.5 text-sm ${
                  weekdays.includes(d)
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {kind === "date_closed" && (
          <>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={range}
                onChange={(e) => setRange(e.target.checked)}
                className="rounded border-slate-300"
              />
              Période
            </label>
            {range ? (
              <>
                <label>
                  <span className="text-xs uppercase tracking-wide text-slate-500">Du</span>
                  <input
                    type="date"
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="mt-1 block rounded border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs uppercase tracking-wide text-slate-500">Au</span>
                  <input
                    type="date"
                    required
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="mt-1 block rounded border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </label>
              </>
            ) : (
              <label>
                <span className="text-xs uppercase tracking-wide text-slate-500">Date</span>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 block rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              </label>
            )}
          </>
        )}

        {kind === "date_special" && (
          <>
            <label>
              <span className="text-xs uppercase tracking-wide text-slate-500">Date</span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
            <label>
              <span className="text-xs uppercase tracking-wide text-slate-500">Label</span>
              <input
                type="text"
                required
                value={specialLabel}
                onChange={(e) => setSpecialLabel(e.target.value)}
                className="mt-1 block w-40 rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
            <label>
              <span className="text-xs uppercase tracking-wide text-slate-500">De</span>
              <input
                type="time"
                required
                value={specialStart}
                onChange={(e) => setSpecialStart(e.target.value)}
                className="mt-1 block rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
            <label>
              <span className="text-xs uppercase tracking-wide text-slate-500">À</span>
              <input
                type="time"
                required
                value={specialEnd}
                onChange={(e) => setSpecialEnd(e.target.value)}
                className="mt-1 block rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
          </>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "…" : "Ajouter"}
        </button>
      </div>
      {err && <div className="mt-2 text-sm text-rose-700">{err}</div>}
    </form>
  );
}
