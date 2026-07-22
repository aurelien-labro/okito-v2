"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type ApiError,
  type ConnectorStatus,
  getCurrentTenantId,
  installConnector,
  listConnectors,
  patchConnector,
  uninstallConnector,
} from "../_lib/api-client";

/**
 * Marketplace de connecteurs tiers signés (vague 5, chantier 4).
 *
 * Le patron colle un manifest JSON + sa signature Ed25519 (fournis par
 * l'éditeur). L'API vérifie la signature contre le registre des éditeurs
 * de confiance ; à l'installation, chaque connecteur ajoute un type d'action
 * `ext.<id>` à Jarvis — soumis par défaut à validation du patron (policy
 * "approval"), ajustable depuis la Boutique d'automatisations.
 */

export default function ConnectorsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [items, setItems] = useState<ConnectorStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState("");
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (tid: string) => {
    setError(null);
    try {
      const { data } = await listConnectors(tid);
      setItems(data);
    } catch (err) {
      setItems([]);
      setError(readableError(err));
    }
  }, []);

  useEffect(() => {
    const tid = getCurrentTenantId();
    setTenantId(tid);
    if (tid) void refresh(tid);
    else setItems([]);
  }, [refresh]);

  async function onInstall(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId) return;
    setSubmitting(true);
    setError(null);
    try {
      await installConnector(tenantId, manifest.trim(), signature.trim());
      setManifest("");
      setSignature("");
      await refresh(tenantId);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onToggle(connectorId: string, enabled: boolean) {
    if (!tenantId) return;
    setBusyId(connectorId);
    try {
      await patchConnector(tenantId, connectorId, { enabled });
      await refresh(tenantId);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onUninstall(connectorId: string) {
    if (!tenantId) return;
    if (!confirm(`Désinstaller le connecteur "${connectorId}" ?`)) return;
    setBusyId(connectorId);
    try {
      await uninstallConnector(tenantId, connectorId);
      await refresh(tenantId);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (!tenantId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Connecteurs</h1>
        <p className="mt-4 text-sm text-stone-500">
          Sélectionnez un tenant pour gérer ses connecteurs.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Connecteurs tiers</h1>
        <p className="mt-1 text-sm text-stone-500">
          Ajoutez des connecteurs signés par des éditeurs de confiance. Chaque connecteur expose une
          action <code className="font-mono text-xs">ext.&lt;id&gt;</code> à Jarvis, soumise par
          défaut à votre validation.
        </p>
      </header>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Installer un connecteur</h2>
        <p className="mt-1 text-xs text-stone-500">
          Collez le manifest JSON et sa signature Ed25519 (base64) fournis par l'éditeur.
        </p>
        <form onSubmit={onInstall} className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-stone-600">Manifest (JSON signé)</span>
            <textarea
              value={manifest}
              onChange={(e) => setManifest(e.target.value)}
              required
              rows={8}
              className="mt-1 w-full rounded border border-stone-300 p-2 font-mono text-xs"
              placeholder='{"id":"meteo-alerts","name":"Alertes météo",…}'
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-stone-600">Signature (base64)</span>
            <input
              type="text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              required
              className="mt-1 w-full rounded border border-stone-300 p-2 font-mono text-xs"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !manifest.trim() || !signature.trim()}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "Vérification…" : "Installer"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Installés</h2>
        {items === null ? (
          <p className="mt-2 text-sm text-stone-500">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Aucun connecteur installé pour l'instant.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {items.map((c) => (
              <li key={c.connectorId} className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.name}</span>
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-mono text-stone-500">
                        v{c.version}
                      </span>
                      {!c.enabled && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          désactivé
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-stone-600">{c.description}</p>
                    <p className="mt-2 text-xs text-stone-500">
                      Éditeur : <span className="font-medium">{c.publisher}</span> · Action Jarvis :{" "}
                      <code className="font-mono">{c.actionType}</code>
                    </p>
                    <p className="mt-0.5 text-xs text-stone-400">Endpoint : {c.endpoint}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => onToggle(c.connectorId, !c.enabled)}
                      disabled={busyId === c.connectorId}
                      className="rounded border border-stone-300 px-3 py-1 text-xs hover:bg-stone-50 disabled:opacity-50"
                    >
                      {c.enabled ? "Désactiver" : "Réactiver"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUninstall(c.connectorId)}
                      disabled={busyId === c.connectorId}
                      className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Désinstaller
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function readableError(err: unknown): string {
  const apiErr = err as Partial<ApiError>;
  if (apiErr?.message) return apiErr.message;
  if (err instanceof Error) return err.message;
  return "Erreur inconnue";
}
