"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoginGate } from "../../_components/login-gate";
import {
  type Reservation,
  type ReservationUpdate,
  cancelReservation,
  getReservation,
  updateReservation,
} from "../../_lib/api-client";

export default function ReservationDetailPage() {
  return (
    <LoginGate>
      <ReservationDetail />
    </LoginGate>
  );
}

function ReservationDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await getReservation(id);
      setReservation(res.data);
      setForm(toForm(res.data));
    } catch (e) {
      setErr(extractMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const dirty = useMemo(() => {
    if (!reservation || !form) return false;
    return JSON.stringify(form) !== JSON.stringify(toForm(reservation));
  }, [reservation, form]);

  const cancelled = reservation?.status === "cancelled";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !reservation) return;
    setSaving(true);
    setErr(null);
    try {
      const patch = diffPatch(toForm(reservation), form);
      if (Object.keys(patch).length === 0) {
        setSaving(false);
        return;
      }
      const res = await updateReservation(id, patch);
      setReservation(res.data);
      setForm(toForm(res.data));
      setSavedAt(new Date().toLocaleTimeString("fr-FR"));
    } catch (e) {
      setErr(extractMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Annuler définitivement cette réservation ?")) return;
    setCancelling(true);
    setErr(null);
    try {
      const res = await cancelReservation(id);
      setReservation(res.data);
      setForm(toForm(res.data));
    } catch (e) {
      setErr(extractMessage(e));
    } finally {
      setCancelling(false);
    }
  }

  function patchForm(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  if (loading) {
    return <div className="p-8 text-sm text-stone-500">Chargement…</div>;
  }

  if (err && !reservation) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      </div>
    );
  }

  if (!reservation || !form) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 text-sm text-stone-500">Réservation introuvable.</div>
      </div>
    );
  }

  return (
    <div>
      <BackLink />

      <header className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {reservation.customerName} · {reservation.couverts} couvert
            {reservation.couverts > 1 ? "s" : ""}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {fmtDateFR(reservation.dateReservation)} à {reservation.heure.slice(0, 5)}
            <span className="ml-2">·</span>
            <StatusBadge className="ml-2" status={reservation.status} />
            <span className="ml-2">·</span>
            <span className="ml-2 uppercase tracking-wide text-stone-500">
              {reservation.source}
            </span>
          </p>
        </div>
        <div className="text-right text-xs text-stone-500">
          <div>Créée : {fmtDateTime(reservation.createdAt)}</div>
        </div>
      </header>

      {cancelled && (
        <div className="mt-4 rounded border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
          Cette réservation est annulée. L'édition est désactivée.
        </div>
      )}

      <form onSubmit={handleSave} className="mt-6 space-y-6">
        <Section title="Créneau">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Date *">
              <input
                type="date"
                value={form.dateReservation}
                onChange={(e) => patchForm({ dateReservation: e.target.value })}
                disabled={cancelled}
                required
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50 disabled:text-stone-400"
              />
            </Field>
            <Field label="Heure *">
              <input
                type="time"
                value={form.heure.slice(0, 5)}
                onChange={(e) => patchForm({ heure: `${e.target.value}:00` })}
                disabled={cancelled}
                required
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50 disabled:text-stone-400"
              />
            </Field>
            <Field label="Couverts *">
              <input
                type="number"
                min={1}
                max={20}
                value={form.couverts}
                onChange={(e) => patchForm({ couverts: Number(e.target.value) })}
                disabled={cancelled}
                required
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50 disabled:text-stone-400"
              />
            </Field>
          </div>
        </Section>

        <Section title="Client">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nom *">
              <input
                value={form.customerName}
                onChange={(e) => patchForm({ customerName: e.target.value })}
                disabled={cancelled}
                required
                minLength={2}
                maxLength={100}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50 disabled:text-stone-400"
              />
            </Field>
            <Field label="Téléphone *">
              <input
                type="tel"
                value={form.customerPhone}
                onChange={(e) => patchForm({ customerPhone: e.target.value })}
                disabled={cancelled}
                required
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50 disabled:text-stone-400"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.customerEmail}
                onChange={(e) => patchForm({ customerEmail: e.target.value })}
                disabled={cancelled}
                placeholder="paul@exemple.fr"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50 disabled:text-stone-400"
              />
            </Field>
          </div>
        </Section>

        <Section title="Notes internes">
          <textarea
            value={form.notes}
            onChange={(e) => patchForm({ notes: e.target.value })}
            disabled={cancelled}
            rows={3}
            maxLength={500}
            placeholder="Allergies, demandes spéciales, table préférée…"
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50 disabled:text-stone-400"
          />
          <p className="mt-1 text-xs text-stone-400">{form.notes.length} / 500 caractères</p>
        </Section>

        {err && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {err}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-stone-200 pt-4">
          <div className="text-xs text-stone-500">
            {cancelled
              ? "Annulée."
              : dirty
                ? "Modifications non sauvegardées."
                : savedAt
                  ? `Sauvegardé à ${savedAt}.`
                  : "À jour."}
          </div>
          <div className="flex gap-2">
            {!cancelled && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="rounded border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {cancelling ? "Annulation…" : "Annuler la résa"}
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push("/reservations")}
              className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              Retour
            </button>
            <button
              type="submit"
              disabled={!dirty || saving || cancelled}
              className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

interface FormState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  couverts: number;
  dateReservation: string;
  heure: string;
  notes: string;
}

function toForm(r: Reservation): FormState {
  return {
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail ?? "",
    couverts: r.couverts,
    dateReservation: r.dateReservation,
    heure: r.heure,
    notes: r.notes ?? "",
  };
}

function diffPatch(prev: FormState, next: FormState): ReservationUpdate {
  const patch: ReservationUpdate = {};
  if (prev.customerName !== next.customerName) patch.customerName = next.customerName;
  if (prev.customerPhone !== next.customerPhone) patch.customerPhone = next.customerPhone;
  if (prev.customerEmail !== next.customerEmail) {
    if (next.customerEmail.trim()) patch.customerEmail = next.customerEmail.trim();
  }
  if (prev.couverts !== next.couverts) patch.couverts = next.couverts;
  if (prev.dateReservation !== next.dateReservation) patch.dateReservation = next.dateReservation;
  if (prev.heure !== next.heure) patch.heure = next.heure;
  if (prev.notes !== next.notes) {
    if (next.notes.trim()) patch.notes = next.notes;
  }
  return patch;
}

function extractMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Erreur inconnue";
}

function fmtDateFR(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-6">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-stone-700">{label}</span>
      {children}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/reservations"
      className="text-sm text-stone-500 hover:text-stone-900 hover:underline"
    >
      ← Réservations
    </Link>
  );
}

function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const cls =
    status === "confirmed"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status === "cancelled"
        ? "bg-stone-100 text-stone-500 border-stone-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls} ${className}`}
    >
      {status}
    </span>
  );
}
