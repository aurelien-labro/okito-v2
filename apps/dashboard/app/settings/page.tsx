"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type HealthStatus,
  type Tenant,
  type TenantUpdate,
  getHealth,
  getTenant,
  listTenants,
  updateTenant,
} from "../_lib/api-client";

const TIMEZONES = [
  "Europe/Paris",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

export default function SettingsPage() {
  return (
    <LoginGate>
      <SettingsView />
    </LoginGate>
  );
}

function SettingsView() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    listTenants()
      .then((res) => {
        setTenants(res.data);
        if (res.data[0]) setTenantId(res.data[0].id);
      })
      .catch((e) => setErr(extractMessage(e)));
    getHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  const reload = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const res = await getTenant(id);
      setTenant(res.data);
      setForm(toForm(res.data));
    } catch (e) {
      setErr(extractMessage(e));
    }
  }, []);

  useEffect(() => {
    reload(tenantId);
  }, [tenantId, reload]);

  const dirty = useMemo(() => {
    if (!tenant || !form) return false;
    return JSON.stringify(form) !== JSON.stringify(toForm(tenant));
  }, [tenant, form]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant || !form) return;
    setSaving(true);
    setErr(null);
    try {
      const patch = diffPatch(toForm(tenant), form);
      if (Object.keys(patch).length === 0) {
        setSaving(false);
        return;
      }
      const res = await updateTenant(tenant.id, patch);
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

  function toggleNotif(
    audience: "manager" | "client",
    event: "onCreate" | "onCancel" | "onReminder",
    channel: "email" | "whatsapp" | "sms",
  ) {
    if (!form) return;
    const prefs = structuredClone(form.notificationPreferences) as Record<
      string,
      Record<string, ChannelsSet | undefined> | undefined
    >;
    if (!prefs[audience]) prefs[audience] = {};
    const branch = prefs[audience];
    if (branch && !branch[event]) branch[event] = {};
    const set = branch?.[event];
    if (set) set[channel] = !set[channel];
    patchForm({ notificationPreferences: prefs as NotifPrefs });
  }

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
          <p className="mt-1 text-sm text-stone-500">
            Configure ton restaurant — informations, capacité, notifications, widget.
          </p>
        </div>
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="rounded border border-stone-300 px-3 py-2 text-sm"
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </header>

      {err && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {!tenant || !form ? (
        <div className="mt-8 rounded-lg border border-stone-200 bg-white p-12 text-center text-sm text-stone-500">
          Chargement…
        </div>
      ) : (
        <form onSubmit={save} className="mt-6 space-y-6">
          <Section title="Identité">
            <Grid cols={2}>
              <Field label="Nom commercial">
                <Input value={form.name} onChange={(v) => patchForm({ name: v })} required />
              </Field>
              <Field label="Email contact">
                <Input
                  type="email"
                  value={form.contactEmail ?? ""}
                  onChange={(v) => patchForm({ contactEmail: v || null })}
                />
              </Field>
              <Field label="Téléphone contact">
                <Input
                  type="tel"
                  value={form.contactPhone ?? ""}
                  onChange={(v) => patchForm({ contactPhone: v || null })}
                />
              </Field>
              <Field label="Fuseau horaire">
                <Select
                  value={form.timezone}
                  options={
                    TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]
                  }
                  onChange={(v) => patchForm({ timezone: v })}
                />
              </Field>
            </Grid>
          </Section>

          <Section title="Capacité & horaires">
            <Grid cols={2}>
              <Field label="Capacité max (couverts/créneau)">
                <Input
                  type="number"
                  value={String(form.capacityMax)}
                  onChange={(v) => patchForm({ capacityMax: Number(v) || 0 })}
                  min={1}
                  max={10000}
                />
              </Field>
              <Field label="Rappels J-1">
                <Toggle
                  checked={form.remindersEnabled}
                  onChange={(v) => patchForm({ remindersEnabled: v })}
                  label="Activer le cron rappels"
                />
              </Field>
            </Grid>
          </Section>

          <Section title="Notifications">
            <p className="-mt-2 mb-4 text-xs text-stone-500">
              Choisis qui reçoit quoi sur quel canal. Manager = toi/ton équipe ; Client = la
              personne qui a réservé.
            </p>
            <NotifMatrix prefs={form.notificationPreferences} onToggle={toggleNotif} />
          </Section>

          <Section title="Widget chat — apparence">
            <Grid cols={2}>
              <Field label="Couleur primaire">
                <input
                  type="color"
                  value={form.branding.primaryColor || "#1c1917"}
                  onChange={(e) =>
                    patchForm({
                      branding: { ...form.branding, primaryColor: e.target.value },
                    })
                  }
                  className="h-10 w-full rounded border border-stone-300 px-1"
                />
              </Field>
              <Field label="URL du logo (https://…)">
                <Input
                  value={form.branding.logoUrl ?? ""}
                  onChange={(v) =>
                    patchForm({
                      branding: { ...form.branding, logoUrl: v || undefined },
                    })
                  }
                />
              </Field>
              <Field label="Titre du chat">
                <Input
                  value={form.branding.title ?? ""}
                  onChange={(v) =>
                    patchForm({ branding: { ...form.branding, title: v || undefined } })
                  }
                  placeholder="Réserver"
                />
              </Field>
              <Field label="Message d'accueil">
                <Input
                  value={form.branding.greeting ?? ""}
                  onChange={(v) =>
                    patchForm({ branding: { ...form.branding, greeting: v || undefined } })
                  }
                  placeholder="Bonjour ! Comment puis-je vous aider ?"
                />
              </Field>
            </Grid>
          </Section>

          <Section title="Acomptes anti-no-show">
            <p className="-mt-2 mb-4 text-xs text-stone-500">
              Retiens un acompte pour réduire le no-show (déduit de l'addition). 0 € = feature
              désactivée.
            </p>
            <Grid cols={3}>
              <Field label="Montant (centimes EUR)">
                <Input
                  type="number"
                  value={String(form.depositAmountCents)}
                  onChange={(v) => patchForm({ depositAmountCents: Number(v) || 0 })}
                  min={0}
                  max={100000}
                  placeholder="0 = désactivé, 1000 = 10€"
                />
              </Field>
              <Field label="À partir de N couverts (0 = toujours)">
                <Input
                  type="number"
                  value={String(form.depositRequiredAboveParty)}
                  onChange={(v) => patchForm({ depositRequiredAboveParty: Number(v) || 0 })}
                  min={0}
                  max={50}
                />
              </Field>
              <Field label="Devise">
                <Select
                  value={form.depositCurrency}
                  options={["EUR", "USD", "GBP", "CHF"]}
                  onChange={(v) =>
                    patchForm({ depositCurrency: v as FormState["depositCurrency"] })
                  }
                />
              </Field>
            </Grid>
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
            <button
              type="submit"
              disabled={!dirty || saving}
              className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </form>
      )}

      <section className="mt-12">
        <h2 className="text-base font-semibold text-stone-900">Providers (lecture seule)</h2>
        <p className="mt-1 text-xs text-stone-500">
          Configuration infra côté serveur. Pour modifier, mettre à jour les variables d'env.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <SettingsGroup title="Email">
            <Row label="Provider" value={health?.notifiers?.email.provider ?? "—"} />
            <Row label="Statut" value={health?.notifiers?.email.status ?? "—"} />
          </SettingsGroup>
          <SettingsGroup title="WhatsApp">
            <Row label="Provider" value={health?.notifiers?.whatsapp.provider ?? "—"} />
            <Row label="Statut" value={health?.notifiers?.whatsapp.status ?? "—"} />
          </SettingsGroup>
          <SettingsGroup title="SMS">
            <Row label="Provider" value={health?.notifiers?.sms.provider ?? "—"} />
            <Row label="Statut" value={health?.notifiers?.sms.status ?? "—"} />
          </SettingsGroup>
          <SettingsGroup title="Voix (Vapi)">
            <Row label="Statut" value={health?.voice?.vapi.status ?? "—"} />
            <Row label="Assistant ID" value={health?.voice?.vapi.assistantId ?? "—"} />
          </SettingsGroup>
          <SettingsGroup title="Moteur">
            <Row label="LLM" value={health?.llm.model ?? "—"} />
            <Row label="Env" value={health?.env ?? "—"} />
          </SettingsGroup>
          <SettingsGroup title="Observabilité">
            <Row label="Sentry" value={health?.observability?.sentry.status ?? "—"} />
          </SettingsGroup>
        </div>
      </section>
    </div>
  );
}

interface FormState {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  timezone: string;
  capacityMax: number;
  remindersEnabled: boolean;
  notificationPreferences: NotifPrefs;
  branding: Branding;
  depositAmountCents: number;
  depositRequiredAboveParty: number;
  depositCurrency: "EUR" | "USD" | "GBP" | "CHF";
}

type NotifPrefs = {
  manager?: { onCreate?: ChannelsSet; onCancel?: ChannelsSet };
  client?: { onCreate?: ChannelsSet; onReminder?: ChannelsSet };
};
type ChannelsSet = { email?: boolean; whatsapp?: boolean; sms?: boolean };
type Branding = {
  primaryColor?: string;
  logoUrl?: string;
  title?: string;
  greeting?: string;
};

function toForm(t: Tenant): FormState {
  const raw = t as unknown as Tenant & Partial<FormState>;
  return {
    name: t.name,
    contactEmail: t.contactEmail,
    contactPhone: t.contactPhone,
    timezone: t.timezone,
    capacityMax: t.capacityMax,
    remindersEnabled: t.remindersEnabled,
    notificationPreferences: (raw.notificationPreferences ?? {}) as NotifPrefs,
    branding: (raw.branding ?? {}) as Branding,
    depositAmountCents: raw.depositAmountCents ?? 0,
    depositRequiredAboveParty: raw.depositRequiredAboveParty ?? 0,
    depositCurrency: (raw.depositCurrency ?? "EUR") as FormState["depositCurrency"],
  };
}

function diffPatch(prev: FormState, next: FormState): TenantUpdate {
  const patch = {} as Record<string, unknown>;
  if (prev.name !== next.name) patch.name = next.name;
  if (prev.contactEmail !== next.contactEmail) patch.contactEmail = next.contactEmail;
  if (prev.contactPhone !== next.contactPhone) patch.contactPhone = next.contactPhone;
  if (prev.timezone !== next.timezone) patch.timezone = next.timezone;
  if (prev.capacityMax !== next.capacityMax) patch.capacityMax = next.capacityMax;
  if (prev.remindersEnabled !== next.remindersEnabled)
    patch.remindersEnabled = next.remindersEnabled;
  if (JSON.stringify(prev.notificationPreferences) !== JSON.stringify(next.notificationPreferences))
    patch.notificationPreferences = next.notificationPreferences;
  if (JSON.stringify(prev.branding) !== JSON.stringify(next.branding))
    patch.branding = next.branding;
  if (prev.depositAmountCents !== next.depositAmountCents)
    patch.depositAmountCents = next.depositAmountCents;
  if (prev.depositRequiredAboveParty !== next.depositRequiredAboveParty)
    patch.depositRequiredAboveParty = next.depositRequiredAboveParty;
  if (prev.depositCurrency !== next.depositCurrency) patch.depositCurrency = next.depositCurrency;
  return patch as TenantUpdate;
}

function NotifMatrix({
  prefs,
  onToggle,
}: {
  prefs: NotifPrefs;
  onToggle: (
    audience: "manager" | "client",
    event: "onCreate" | "onCancel" | "onReminder",
    channel: "email" | "whatsapp" | "sms",
  ) => void;
}) {
  const rows: Array<{
    label: string;
    audience: "manager" | "client";
    event: "onCreate" | "onCancel" | "onReminder";
  }> = [
    { label: "Manager — résa créée", audience: "manager", event: "onCreate" },
    { label: "Manager — résa annulée", audience: "manager", event: "onCancel" },
    { label: "Client — confirmation", audience: "client", event: "onCreate" },
    { label: "Client — rappel J-1", audience: "client", event: "onReminder" },
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-stone-500">
          <th className="px-2 py-2 text-left font-medium" />
          <th className="px-2 py-2 font-medium">Email</th>
          <th className="px-2 py-2 font-medium">WhatsApp</th>
          <th className="px-2 py-2 font-medium">SMS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const branch = prefs[r.audience] as Record<string, ChannelsSet | undefined> | undefined;
          const cs = branch?.[r.event] ?? {};
          return (
            <tr key={`${r.audience}-${r.event}`} className="border-t border-stone-100">
              <td className="px-2 py-2 text-stone-700">{r.label}</td>
              {(["email", "whatsapp", "sms"] as const).map((ch) => (
                <td key={ch} className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={Boolean(cs[ch])}
                    onChange={() => onToggle(r.audience, r.event, ch)}
                    className="h-4 w-4 accent-stone-900"
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-6">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return <div className={`grid gap-4 md:grid-cols-${cols}`}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-stone-700">{label}</span>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  ...rest
}: { value: string; onChange: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
      {...rest}
    />
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded border border-stone-200 p-2.5 hover:bg-stone-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-stone-900"
      />
      <span className="text-sm text-stone-700">{label}</span>
    </label>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-5 py-4">
      <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
      <dl className="mt-3 space-y-2">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-900">{value}</dd>
    </div>
  );
}

function extractMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Erreur inconnue";
}
