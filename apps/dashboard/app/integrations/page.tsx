"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type TenantWebhook,
  WEBHOOK_EVENTS,
  type WebhookEvent,
  createWebhook,
  deleteWebhook,
  getCurrentTenantId,
  listWebhooks,
  setWebhookActive,
} from "../_lib/api-client";

export default function IntegrationsPage() {
  return (
    <LoginGate>
      <IntegrationsView />
    </LoginGate>
  );
}

function IntegrationsView() {
  const [rows, setRows] = useState<TenantWebhook[]>([]);
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
      const res = await listWebhooks(tenantId);
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

  async function handleToggle(w: TenantWebhook) {
    try {
      await setWebhookActive(w.id, !w.active);
      await fetchData();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  async function handleDelete(w: TenantWebhook) {
    if (!confirm(`Supprimer le webhook vers ${w.url} ?`)) return;
    try {
      await deleteWebhook(w.id);
      await fetchData();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Intégrations — Webhooks</h1>
        <p className="mt-1 text-sm text-stone-500">
          À chaque événement (réservation créée, annulée, no-show, entrée en liste d&apos;attente),
          OKITO envoie un POST JSON signé (header <code>X-Okito-Signature</code>) à vos URLs. Idéal
          pour brancher Zapier, Make, ou votre propre système.
        </p>
      </div>

      <NewWebhookForm onCreated={fetchData} />

      {err && (
        <div className="my-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {loading && rows.length === 0 ? (
          <div className="rounded border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
            Chargement…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
            Aucun webhook. Ajoute une URL ci-dessus pour recevoir les événements.
          </div>
        ) : (
          rows.map((w) => (
            <div key={w.id} className="rounded border border-stone-200 bg-white px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate font-medium">{w.url}</div>
                  <div className="mt-1 text-xs text-stone-500">
                    {w.events.length === 0 ? "Tous les événements" : w.events.join(", ")}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-stone-400">
                    secret : {w.secret.slice(0, 12)}…
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span
                    className={`rounded px-2 py-0.5 font-medium ${
                      w.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"
                    }`}
                  >
                    {w.active ? "actif" : "inactif"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggle(w)}
                    className="text-blue-700 hover:underline"
                  >
                    {w.active ? "Désactiver" : "Activer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(w)}
                    className="text-rose-700 hover:underline"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function NewWebhookForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleEvent(e: WebhookEvent) {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBusy(true);
    setErr(null);
    try {
      const { data } = await createWebhook(tenantId, {
        url: url.trim(),
        events: events.length ? events : undefined,
      });
      setUrl("");
      setEvents([]);
      await onCreated();
      alert(
        `Webhook créé.\n\nSecret de signature (copiez-le maintenant, il ne sera plus affiché en entier) :\n${data.secret}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur création");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded border border-stone-200 bg-white px-4 py-4">
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-stone-500">URL du endpoint</span>
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.zapier.com/…"
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
        />
      </label>
      <div className="mt-3">
        <span className="text-xs uppercase tracking-wide text-stone-500">
          Événements (aucun sélectionné = tous)
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map((ev) => (
            <button
              key={ev}
              type="button"
              onClick={() => toggleEvent(ev)}
              className={`rounded border px-3 py-1.5 text-xs ${
                events.includes(ev)
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-300 text-stone-700 hover:bg-stone-50"
              }`}
            >
              {ev}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "…" : "Ajouter le webhook"}
        </button>
        {err && <div className="text-sm text-rose-700">{err}</div>}
      </div>
    </form>
  );
}
