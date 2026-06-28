"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import { type AuditLogEntry, listAuditLog } from "../_lib/api-client";

export default function AuditPage() {
  return (
    <LoginGate>
      <AuditView />
    </LoginGate>
  );
}

function AuditView() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<string>("");
  const [entityId, setEntityId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await listAuditLog({
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        limit: 200,
      });
      setEntries(res.data);
    } catch (e) {
      setErr(extractMessage(e));
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Journal d'audit</h1>
          <p className="mt-1 text-sm text-stone-500">
            Toutes les actions admin (création / modification / suspension / activation des tenants
            et réservations). 200 entrées max.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="rounded border border-stone-300 px-3 py-2 text-sm"
          >
            <option value="">Tout type</option>
            <option value="tenant">tenant</option>
            <option value="reservation">reservation</option>
          </select>
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="entity id (uuid)"
            className="w-72 rounded border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={load}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
          >
            Recharger
          </button>
        </div>
      </header>

      {err && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
            Chargement…
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
            Aucune entrée.
          </div>
        ) : (
          entries.map((e) => <Entry key={e.id} entry={e} />)
        )}
      </div>
    </div>
  );
}

function Entry({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-stone-50"
      >
        <div className="flex items-center gap-3">
          <ActionBadge action={entry.action} />
          <span className="text-xs text-stone-500">{entry.entityType}</span>
          {entry.entityId && (
            <code className="rounded bg-stone-100 px-1 py-0.5 text-xs text-stone-600">
              {entry.entityId.slice(0, 8)}…
            </code>
          )}
        </div>
        <div className="text-xs text-stone-500">
          {entry.actorUserId ? `par ${entry.actorUserId.slice(0, 8)}…` : "inconnu"}
          <span className="ml-3">{fmtDateTime(entry.createdAt)}</span>
        </div>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-stone-100 px-4 py-3 text-xs md:grid-cols-2">
          <PreBlock title="Avant" payload={entry.before} />
          <PreBlock title="Après" payload={entry.after} />
          {entry.ip && (
            <div className="text-stone-500">
              IP : <code className="rounded bg-stone-100 px-1 py-0.5">{entry.ip}</code>
            </div>
          )}
          {entry.userAgent && <div className="text-stone-500 truncate">UA : {entry.userAgent}</div>}
        </div>
      )}
    </div>
  );
}

function PreBlock({ title, payload }: { title: string; payload: unknown }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-stone-500">{title}</div>
      <pre className="max-h-64 overflow-auto rounded bg-stone-50 p-2 text-[11px] text-stone-700">
        {payload ? JSON.stringify(payload, null, 2) : "—"}
      </pre>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const isCreate = action.endsWith(".create");
  const isUpdate = action.endsWith(".update");
  const isSuspend = action.endsWith(".suspend") || action.endsWith(".cancel");
  const cls = isCreate
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : isUpdate
      ? "bg-blue-50 text-blue-800 border-blue-200"
      : isSuspend
        ? "bg-red-50 text-red-800 border-red-200"
        : "bg-stone-100 text-stone-700 border-stone-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {action}
    </span>
  );
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

function extractMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Erreur inconnue";
}
