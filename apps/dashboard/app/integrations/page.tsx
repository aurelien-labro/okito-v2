"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  API_URL,
  type Mailbox,
  type TenantWebhook,
  WEBHOOK_EVENTS,
  type WebhookEvent,
  connectImapMailbox,
  connectMailbox,
  connectOutlookMailbox,
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

/** Catalogue des fournisseurs email, façon n8n : une carte par intégration. */
interface EmailProvider {
  id: string;
  name: string;
  description: string;
  logo: React.ReactNode;
  available: boolean;
}

const EMAIL_PROVIDERS: EmailProvider[] = [
  {
    id: "gmail",
    name: "Gmail",
    description:
      "Connecte la boîte Gmail du commerce en OAuth. Chaque email entre dans le journal de Jarvis (lecture seule, révocable).",
    logo: <GmailLogo />,
    available: true,
  },
  {
    id: "outlook",
    name: "Outlook / Microsoft 365",
    description: "Boîtes Outlook.com et Microsoft 365 professionnelles, via OAuth Microsoft Graph.",
    logo: <OutlookLogo />,
    available: true,
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    description:
      "Boîtes Yahoo Mail via IMAP. Nécessite un mot de passe d'application (Compte Yahoo → Sécurité).",
    logo: <YahooLogo />,
    available: true,
  },
  {
    id: "imap",
    name: "IMAP générique",
    description:
      "N'importe quelle boîte (OVH, Gandi, Infomaniak…) via IMAP : serveur, port, identifiants.",
    logo: <ImapLogo />,
    available: true,
  },
];

const PROVIDER_LOGO: Record<string, React.ReactNode> = {
  gmail: <GmailLogo />,
  outlook: <OutlookLogo />,
  yahoo: <YahooLogo />,
  imap: <ImapLogo />,
};

function GmailLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <path fill="#EA4335" d="M12 11.1 3.2 4.4h17.6L12 11.1Z" />
      <path fill="#FBBC04" d="M2 5.4v13.2h3.6V8.2L2 5.4Z" />
      <path fill="#34A853" d="M18.4 8.2v10.4H22V5.4l-3.6 2.8Z" />
      <path fill="#4285F4" d="M5.6 18.6h12.8V8.2L12 13.1 5.6 8.2v10.4Z" opacity=".9" />
    </svg>
  );
}

function OutlookLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <rect x="2" y="5" width="12" height="14" rx="2" fill="#0F6CBD" />
      <text x="8" y="16" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">
        O
      </text>
      <rect x="12" y="7" width="10" height="10" rx="1.5" fill="#28A8EA" />
      <path d="M12 7h10L17 12.5 12 7Z" fill="#50D9FF" />
    </svg>
  );
}

function YahooLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#5F01D1" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">
        Y!
      </text>
    </svg>
  );
}

function ImapLogo() {
  return <span className="ti ti-server-2 text-[26px] text-stone-500" aria-hidden="true" />;
}

function MailboxesSection() {
  const [boxes, setBoxes] = useState<Mailbox[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [search, setSearch] = useState("");
  const [imapForm, setImapForm] = useState<"imap" | "yahoo" | null>(null);

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

  async function handleConnectOutlook() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    try {
      const res = await connectOutlookMailbox(tenantId);
      window.location.href = res.data.url;
    } catch (e) {
      const code = (e as { code?: string }).code;
      alert(
        code === "outlook_unavailable"
          ? "OAuth Microsoft non configuré côté API (variables MICROSOFT_* absentes — voir portail Azure)."
          : `Connexion impossible : ${e instanceof Error ? e.message : "erreur"}`,
      );
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

  const q = search.trim().toLowerCase();
  const providers = q
    ? EMAIL_PROVIDERS.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
      )
    : EMAIL_PROVIDERS;

  return (
    <div className="mb-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Intégrations — Email</h1>
          <p className="mt-1 text-sm text-stone-500">
            Branche les boîtes du commerce : chaque email entre dans le journal de Jarvis, qui trie,
            résume et répondra bientôt tout seul.
          </p>
        </div>
        <div className="relative">
          <span
            className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une intégration…"
            className="w-64 rounded-lg border border-stone-300 py-2 pl-9 pr-3 text-sm focus:border-stone-500 focus:outline-none"
          />
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {providers.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            connectedCount={boxes.filter((b) => b.provider === p.id).length}
            connecting={p.id === "gmail" && connecting}
            onConnect={
              p.id === "gmail"
                ? handleConnect
                : p.id === "outlook"
                  ? handleConnectOutlook
                  : p.id === "yahoo" || p.id === "imap"
                    ? () => setImapForm(imapForm === p.id ? null : (p.id as "imap" | "yahoo"))
                    : undefined
            }
          />
        ))}
        {providers.length === 0 && (
          <div className="col-span-full rounded-lg border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
            Aucune intégration ne correspond à « {search} ».
          </div>
        )}
      </div>

      {imapForm && (
        <ImapConnectForm
          provider={imapForm}
          onCancel={() => setImapForm(null)}
          onConnected={async () => {
            setImapForm(null);
            await fetchBoxes();
          }}
        />
      )}

      {boxes.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Boîtes connectées</h2>
          <div className="space-y-3">
            {boxes.map((box) => (
              <div
                key={box.id}
                className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {PROVIDER_LOGO[box.provider] ?? <ImapLogo />}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{box.emailAddress}</div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {box.lastSyncAt
                          ? `Dernière sync : ${new Date(box.lastSyncAt).toLocaleString("fr-FR")}`
                          : "Jamais synchronisée (première sync dans les 5 min)"}
                      </div>
                      {box.status === "error" && box.lastError && (
                        <div className="mt-1 text-xs text-rose-700">{box.lastError}</div>
                      )}
                    </div>
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ImapConnectForm({
  provider,
  onCancel,
  onConnected,
}: {
  provider: "imap" | "yahoo";
  onCancel: () => void;
  onConnected: () => Promise<void>;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isYahoo = provider === "yahoo";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBusy(true);
    setErr(null);
    try {
      await connectImapMailbox(tenantId, {
        provider,
        host: isYahoo ? undefined : host.trim(),
        port: isYahoo ? undefined : Number.parseInt(port, 10) || 993,
        user: user.trim(),
        password,
      });
      await onConnected();
    } catch (ex) {
      const code = (ex as { code?: string }).code;
      setErr(
        code === "imap_unavailable"
          ? "Boîtes IMAP non activées côté API (variable MAILBOX_ENC_KEY absente)."
          : ex instanceof Error
            ? ex.message
            : "Connexion impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        {isYahoo ? <YahooLogo /> : <ImapLogo />}
        <h3 className="text-sm font-semibold">
          {isYahoo ? "Connecter une boîte Yahoo Mail" : "Connecter une boîte IMAP"}
        </h3>
      </div>
      {isYahoo && (
        <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Yahoo exige un <strong>mot de passe d'application</strong> (pas ton mot de passe habituel)
          : Compte Yahoo → Sécurité → Générer un mot de passe d'application.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        {!isYahoo && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500" htmlFor="imap-host">
                Serveur IMAP
              </label>
              <input
                id="imap-host"
                type="text"
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="imap.mondomaine.fr"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500" htmlFor="imap-port">
                Port
              </label>
              <input
                id="imap-port"
                type="text"
                inputMode="numeric"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
          </>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500" htmlFor="imap-user">
            Adresse email
          </label>
          <input
            id="imap-user"
            type="email"
            required
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder={isYahoo ? "boulangerie@yahoo.fr" : "contact@mondomaine.fr"}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500" htmlFor="imap-pass">
            {isYahoo ? "Mot de passe d'application" : "Mot de passe"}
          </label>
          <input
            id="imap-pass"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Vérification…" : "Connecter"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
        >
          Annuler
        </button>
        {err && <div className="text-sm text-rose-700">{err}</div>}
      </div>
      <p className="mt-2 text-[11px] text-stone-400">
        Le mot de passe est chiffré (AES-256) et ne ressort jamais de l'API. Seuls les nouveaux
        emails reçus après la connexion sont lus.
      </p>
    </form>
  );
}

function ProviderCard({
  provider,
  connectedCount,
  connecting,
  onConnect,
}: {
  provider: EmailProvider;
  connectedCount: number;
  connecting: boolean;
  onConnect?: () => void;
}) {
  const connected = connectedCount > 0;
  return (
    <div
      className={`flex flex-col rounded-lg border bg-white p-4 transition ${
        provider.available
          ? "border-stone-200 hover:border-stone-400 hover:shadow-sm"
          : "border-stone-200 opacity-70"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-100 bg-stone-50">
          {provider.logo}
        </div>
        {connected ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            {connectedCount} connectée{connectedCount > 1 ? "s" : ""}
          </span>
        ) : provider.available ? (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
            Disponible
          </span>
        ) : (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-400">
            Bientôt
          </span>
        )}
      </div>
      <div className="mt-3 text-sm font-semibold text-stone-900">{provider.name}</div>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-stone-500">{provider.description}</p>
      <div className="mt-4">
        {provider.available && onConnect ? (
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className="w-full rounded bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {connecting ? "Redirection…" : connected ? "Ajouter une boîte" : "Connecter"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded border border-stone-200 px-3 py-2 text-xs font-medium text-stone-400"
          >
            Bientôt disponible
          </button>
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
