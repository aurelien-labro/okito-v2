"use client";

import { useEffect, useState } from "react";
import { type HealthStatus, getHealth } from "../_lib/api-client";

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
      <p className="mt-1 text-sm text-stone-500">
        Configuration providers (lecture seule depuis <code>/health</code>).
      </p>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <SettingsGroup title="Email">
          <Row label="Provider" value={health?.notifiers?.email.provider ?? "—"} />
          <Row label="Statut" value={health?.notifiers?.email.status ?? "—"} />
        </SettingsGroup>

        <SettingsGroup title="WhatsApp">
          <Row label="Provider" value={health?.notifiers?.whatsapp.provider ?? "—"} />
          <Row label="Statut" value={health?.notifiers?.whatsapp.status ?? "—"} />
          <Row
            label="Validation signature"
            value={health?.notifiers?.webhookSignatureValidation ? "activée" : "désactivée"}
          />
        </SettingsGroup>

        <SettingsGroup title="SMS">
          <Row label="Provider" value={health?.notifiers?.sms.provider ?? "—"} />
          <Row label="Statut" value={health?.notifiers?.sms.status ?? "—"} />
        </SettingsGroup>

        <SettingsGroup title="Voix">
          <Row label="Provider" value="vapi" />
          <Row label="Statut" value={health?.voice?.vapi.status ?? "—"} />
          <Row label="Assistant ID" value={health?.voice?.vapi.assistantId ?? "—"} />
        </SettingsGroup>

        <SettingsGroup title="Observabilité">
          <Row label="Sentry" value={health?.observability?.sentry.status ?? "—"} />
        </SettingsGroup>

        <SettingsGroup title="Moteur">
          <Row label="LLM" value={health?.llm.model ?? "—"} />
          <Row label="Env" value={health?.env ?? "—"} />
        </SettingsGroup>
      </section>
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-5 py-4">
      <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
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
