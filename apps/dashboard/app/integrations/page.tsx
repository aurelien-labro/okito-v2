"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  API_URL,
  type Mailbox,
  type TenantWebhook,
  WEBHOOK_EVENTS,
  type WebhookEvent,
  connectMailbox,
  createWebhook,
  deleteMailbox,
  deleteWebhook,
  getCurrentTenantId,
  listMailboxes,
  listWebhooks,
  setMailboxStatus,
  setWebhookActive,
} from "../_lib/api-client";

const MAILBOX_STATUS_LABEL: Record<Mailbox["status"], string> = {
  active: "Synchronisée",
  paused: "En pause",
  error: "Erreur",
};

const MAILBOX_STATUS_COLOR: Record<Mailbox["status"], string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-stone-200 text-stone-700",
  error: "bg-rose-100 text-rose-800",
};

function MailboxesSection() {
  const [boxes, setBoxes] = useState<Mailbox[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const fetchBoxes = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    try {
      const res = await listMailboxes(tenantId);
      setBoxes(res.data);
      setErr(null);
    } catch (e) {
      const status = (e as { status?: number }).status;
      // 404 = module non monté (OAuth Google non configuré côté API)
      setErr(
        status === 404
          ? "Connexion Gmail non configurée sur l'API (variables GOOGLE_* absentes)."
          : "Impossible de charger les boîtes.",
      );
    }
  }, []);

  useEffect(() => {
    fetchBoxes();
  }, [fetchBoxes]);

  async function handleConnect() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setConnecting(true);
    try {
      const res = await connectMailbox(tenantId);
      window.location.href = res.data.url;
    } catch (e) {
      alert(`Connexion impossible : ${e instanceof Error ? e.message : "erreur"}`);
      setConnecting(false);
    }
  }

  async function handleToggle(box: Mailbox) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    try {
      await setMailboxStatus(tenantId, box.id, box.status === "paused" ? "active" : "paused");
      await fetchBoxes();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  async function handleDelete(box: Mailbox) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    if (!confirm(`Déconnecter ${box.emailAddress} ? La synchronisation s'arrêtera.`)) return;
    try {
      await deleteMailbox(tenantId, box.id);
      await fetchBoxes();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  return (
    <div className="mb-10">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Intégrations — Email</h1>
          <p className="mt-1 text-sm text-stone-500">
            Connecte la boîte Gmail du commerce : chaque nouvel email entre dans le journal de
            Jarvis (lecture seule, révocable à tout moment).
          </p>
        </div>
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {connecting ? "Redirection…" : "Connecter Gmail"}
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {err}
        </div>
      )}

      <div className="space-y-3">
        {boxes.length === 0 && !err ? (
          <div className="rounded border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
            Aucune boîte connectée.
          </div>
        ) : (
          boxes.map((box) => (
            <div
              key={box.id}
              className="rounded border border-stone-200 bg-white px-4 py-3 text-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate font-medium">{box.emailAddress}</div>
                  <div className="mt-1 text-xs text-stone-500">
                    {box.lastSyncAt
                      ? `Dernière sync : ${new Date(box.lastSyncAt).toLocaleString("fr-FR")}`
                      : "Jamais synchronisée (première sync dans les 5 min)"}
                  </div>
                  {box.status === "error" && box.lastError && (
                    <div className="mt-1 text-xs text-rose-700">{box.lastError}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span
                    className={`rounded px-2 py-0.5 font-medium ${MAILBOX_STATUS_COLOR[box.status]}`}
                  >
                    {MAILBOX_STATUS_LABEL[box.status]}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggle(box)}
                    className="text-blue-700 hover:underline"
                  >
                    {box.status === "paused" ? "Reprendre" : "Mettre en pause"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(box)}
                    className="text-rose-700 hover:underline"
                  >
                    Déconnecter
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

function TrackerSection() {
  const [copied, setCopied] = useState(false);
  const tenantId = getCurrentTenantId();
  if (!tenantId) return null;

  const snippet = `<script src="${API_URL}/v1/track/${tenantId}/script.js" defer></script>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponible (HTTP non sécurisé) : l'utilisateur copiera à la main.
    }
  }

  return (
    <div className="mb-10">
      <h2 className="text-2xl font-semibold tracking-tight">Tracker de visites</h2>
      <p className="mt-1 text-sm text-stone-500">
        Colle cette ligne dans le <code>&lt;head&gt;</code> de ton site : chaque visite alimente la
        carte « Visites site » et le journal de Jarvis. Aucune donnée personnelle collectée (ni IP,
        ni cookie tiers).
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800">
          {snippet}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-700"
        >
          {copied ? "Copié !" : "Copier"}
        </button>
      </div>
    </div>
  );
}

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
      <MailboxesSection />

      <TrackerSection />

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
