"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoginGate } from "../../_components/login-gate";
import { type Tenant, type TenantUpdate, getTenant, updateTenant } from "../../_lib/api-client";

const INDUSTRIES = [
  "restaurant",
  "hotel",
  "garage",
  "beauty",
  "realestate",
  "rental",
  "generic",
] as const;
const STATUSES = ["active", "suspended", "trial"] as const;
const FEATURE_KEYS = [
  "voice",
  "reminders",
  "deposits",
  "waitlist",
  "loyalty",
  "multi_resource",
] as const;
const TIMEZONES = [
  "Europe/Paris",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

type FeatureKey = (typeof FEATURE_KEYS)[number];

export default function TenantDetailPage() {
  return (
    <LoginGate>
      <TenantDetail />
    </LoginGate>
  );
}

function TenantDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await getTenant(id);
      setTenant(res.data);
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
    if (!tenant || !form) return false;
    return JSON.stringify(form) !== JSON.stringify(toForm(tenant));
  }, [tenant, form]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !tenant) return;
    setSaving(true);
    setErr(null);
    try {
      const patch = diffPatch(toForm(tenant), form);
      if (Object.keys(patch).length === 0) {
        setSaving(false);
        return;
      }
      const res = await updateTenant(id, patch);
      setTenant(res.data);
      setForm(toForm(res.data));
      setSavedAt(new Date().toLocaleTimeString("fr-FR"));
    } catch (e) {
      setErr(extractMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function patchForm(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  function toggleFeature(key: FeatureKey) {
    setForm((f) => (f ? { ...f, features: { ...f.features, [key]: !f.features[key] } } : f));
  }

  if (loading) {
    return <div className="p-8 text-sm text-stone-500">Chargement…</div>;
  }

  if (err && !tenant) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      </div>
    );
  }

  if (!tenant || !form) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 text-sm text-stone-500">Tenant introuvable.</div>
      </div>
    );
  }

  return (
    <div>
      <BackLink />

      <header className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
          <p className="mt-1 text-sm text-stone-500">
            <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">{tenant.slug}</code>
            <span className="ml-2">{tenant.industry}</span>
            <span className="ml-2">·</span>
            <StatusBadge className="ml-2" status={tenant.status} />
          </p>
        </div>
        <div className="text-right text-xs text-stone-500">
          <div>Créé : {fmtDate(tenant.createdAt)}</div>
          <div>MAJ : {fmtDate(tenant.updatedAt)}</div>
        </div>
      </header>

      <form onSubmit={handleSave} className="mt-8 space-y-8">
        <Section title="Identité">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nom commercial *">
              <input
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
                required
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Vertical">
              <select
                value={form.industry}
                onChange={(e) => patchForm({ industry: e.target.value })}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              >
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Email contact">
              <input
                type="email"
                value={form.contactEmail ?? ""}
                onChange={(e) => patchForm({ contactEmail: e.target.value || null })}
                placeholder="manager@bistrot.fr"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Téléphone contact">
              <input
                type="tel"
                value={form.contactPhone ?? ""}
                onChange={(e) => patchForm({ contactPhone: e.target.value || null })}
                placeholder="+33 6 12 34 56 78"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </Section>

        <Section title="Exploitation">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Fuseau horaire">
              <select
                value={form.timezone}
                onChange={(e) => patchForm({ timezone: e.target.value })}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              >
                {(TIMEZONES.includes(form.timezone)
                  ? TIMEZONES
                  : [form.timezone, ...TIMEZONES]
                ).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Capacité max">
              <input
                type="number"
                min={1}
                max={10000}
                value={form.capacityMax}
                onChange={(e) => patchForm({ capacityMax: Number(e.target.value) })}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Statut">
              <select
                value={form.status}
                onChange={(e) => patchForm({ status: e.target.value as FormState["status"] })}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <Toggle
              label="Rappels J-1 actifs"
              hint="Active le cron Inngest qui envoie les rappels la veille à 9h."
              checked={form.remindersEnabled}
              onChange={(v) => patchForm({ remindersEnabled: v })}
            />
          </div>
        </Section>

        <Section title="Feature flags">
          <p className="-mt-2 mb-4 text-xs text-stone-500">
            Active/désactive les modules optionnels pour ce tenant. Toujours sauvegardé en un seul
            bloc.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {FEATURE_KEYS.map((key) => (
              <Toggle
                key={key}
                label={FEATURE_LABEL[key]}
                hint={FEATURE_HINT[key]}
                checked={Boolean(form.features[key])}
                onChange={() => toggleFeature(key)}
              />
            ))}
          </div>
        </Section>

        {err && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {err}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-stone-200 pt-4">
          <div className="text-xs text-stone-500">
            {dirty
              ? "Modifications non sauvegardées."
              : savedAt
                ? `Sauvegardé à ${savedAt}.`
                : "À jour."}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/tenants")}
              className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              Retour
            </button>
            <button
              type="submit"
              disabled={!dirty || saving}
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
  name: string;
  industry: string;
  contactEmail: string | null;
  contactPhone: string | null;
  timezone: string;
  capacityMax: number;
  status: "active" | "suspended" | "trial";
  remindersEnabled: boolean;
  features: Record<FeatureKey, boolean>;
}

function toForm(t: Tenant): FormState {
  const features = {} as Record<FeatureKey, boolean>;
  for (const key of FEATURE_KEYS) {
    features[key] = Boolean(t.features?.[key]);
  }
  return {
    name: t.name,
    industry: t.industry,
    contactEmail: t.contactEmail,
    contactPhone: t.contactPhone,
    timezone: t.timezone,
    capacityMax: t.capacityMax,
    status: t.status,
    remindersEnabled: t.remindersEnabled,
    features,
  };
}

function diffPatch(prev: FormState, next: FormState): TenantUpdate {
  const patch: TenantUpdate = {};
  if (prev.name !== next.name) patch.name = next.name;
  if (prev.industry !== next.industry) patch.industry = next.industry;
  if (prev.contactEmail !== next.contactEmail) patch.contactEmail = next.contactEmail;
  if (prev.contactPhone !== next.contactPhone) patch.contactPhone = next.contactPhone;
  if (prev.timezone !== next.timezone) patch.timezone = next.timezone;
  if (prev.capacityMax !== next.capacityMax) patch.capacityMax = next.capacityMax;
  if (prev.status !== next.status) patch.status = next.status;
  if (prev.remindersEnabled !== next.remindersEnabled)
    patch.remindersEnabled = next.remindersEnabled;
  if (JSON.stringify(prev.features) !== JSON.stringify(next.features))
    patch.features = next.features;
  return patch;
}

function extractMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Erreur inconnue";
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const FEATURE_LABEL: Record<FeatureKey, string> = {
  voice: "Agent vocal",
  reminders: "Rappels (J-1)",
  deposits: "Acomptes",
  waitlist: "Liste d'attente",
  loyalty: "Fidélité",
  multi_resource: "Multi-ressources",
};

const FEATURE_HINT: Record<FeatureKey, string> = {
  voice: "Active le canal vocal Vapi pour ce tenant.",
  reminders: "Autorise l'envoi de rappels (à coupler avec le toggle Exploitation).",
  deposits: "Demande un acompte au moment de la réservation.",
  waitlist: "Active une liste d'attente quand le service est plein.",
  loyalty: "Active le suivi de fidélité côté CRM.",
  multi_resource: "Gestion de plusieurs ressources (chambres, postes, etc.).",
};

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

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded border border-stone-200 p-3 hover:bg-stone-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-stone-900"
      />
      <span className="flex-1">
        <span className="block text-sm font-medium text-stone-900">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

function BackLink() {
  return (
    <Link href="/tenants" className="text-sm text-stone-500 hover:text-stone-900 hover:underline">
      ← Tenants
    </Link>
  );
}

function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const cls =
    status === "active"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status === "suspended"
        ? "bg-red-50 text-red-800 border-red-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls} ${className}`}
    >
      {status}
    </span>
  );
}
