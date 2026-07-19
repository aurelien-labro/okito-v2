"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type AuditLogEntry,
  type JarvisAction,
  type TenantMember,
  getCurrentTenantId,
  listAuditLog,
  listJarvisActions,
  listMembers,
} from "../_lib/api-client";

export default function AuditPage() {
  return (
    <LoginGate>
      <AuditView />
    </LoginGate>
  );
}

type ActorFilter = "all" | "human" | "jarvis";

/** Une entrée de la timeline unifiée : action humaine (audit_log) ou action Jarvis. */
type TimelineItem =
  | { kind: "human"; date: string; entry: AuditLogEntry }
  | { kind: "jarvis"; date: string; action: JarvisAction };

function AuditView() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [jarvisActions, setJarvisActions] = useState<JarvisAction[]>([]);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActorFilter>("all");

  const load = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    setLoading(true);
    setErr(null);
    try {
      const [audit, jarvis, team] = await Promise.all([
        listAuditLog({ tenantId: tenantId ?? undefined, limit: 200 }),
        tenantId ? listJarvisActions(tenantId) : Promise.resolve({ data: [] as JarvisAction[] }),
        tenantId ? listMembers(tenantId) : Promise.resolve({ data: [] as TenantMember[] }),
      ]);
      setEntries(audit.data);
      setJarvisActions(jarvis.data);
      setMembers(team.data);
    } catch (e) {
      setErr(extractMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // email par userId pour afficher "qui" au lieu d'un UUID tronqué.
  const memberByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      if (m.userId && m.invitedEmail) map.set(m.userId, m.invitedEmail);
    }
    return map;
  }, [members]);

  const items = useMemo<TimelineItem[]>(() => {
    const human: TimelineItem[] = entries.map((entry) => ({
      kind: "human",
      date: entry.createdAt,
      entry,
    }));
    const jarvis: TimelineItem[] = jarvisActions.map((action) => ({
      kind: "jarvis",
      date: action.executedAt ?? action.cancelledAt ?? action.createdAt,
      action,
    }));
    const all = filter === "human" ? human : filter === "jarvis" ? jarvis : [...human, ...jarvis];
    return all.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 200);
  }, [entries, jarvisActions, filter]);

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timeline — qui a fait quoi</h1>
          <p className="mt-1 text-sm text-slate-500">
            Actions de l'équipe (journal d'audit) et actions de Jarvis, dans un seul fil. 200
            entrées max.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented value={filter} onChange={setFilter} />
          <button
            type="button"
            onClick={load}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
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
          <Placeholder>Chargement…</Placeholder>
        ) : items.length === 0 ? (
          <Placeholder>Aucune entrée.</Placeholder>
        ) : (
          items.map((item) =>
            item.kind === "human" ? (
              <HumanEntry
                key={`a-${item.entry.id}`}
                entry={item.entry}
                actorEmail={
                  item.entry.actorUserId ? memberByUserId.get(item.entry.actorUserId) : undefined
                }
              />
            ) : (
              <JarvisEntry key={`j-${item.action.id}`} action={item.action} />
            ),
          )
        )}
      </div>
    </div>
  );
}

function Segmented({
  value,
  onChange,
}: {
  value: ActorFilter;
  onChange: (v: ActorFilter) => void;
}) {
  const options: Array<{ v: ActorFilter; label: string }> = [
    { v: "all", label: "Tout" },
    { v: "human", label: "Équipe" },
    { v: "jarvis", label: "Jarvis" },
  ];
  return (
    <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1.5 ${
            value === o.v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function HumanEntry({ entry, actorEmail }: { entry: AuditLogEntry; actorEmail?: string }) {
  const [open, setOpen] = useState(false);
  const who =
    entry.actorLabel ??
    actorEmail ??
    (entry.actorUserId ? `${entry.actorUserId.slice(0, 8)}…` : "inconnu");
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="ti ti-user shrink-0 text-slate-400" aria-hidden="true" />
          <ActionBadge action={entry.action} />
          <span className="text-xs text-slate-500">{entry.entityType}</span>
          {entry.entityId && (
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-600">
              {entry.entityId.slice(0, 8)}…
            </code>
          )}
        </div>
        <div className="shrink-0 text-xs text-slate-500">
          par <span className="font-medium text-slate-700">{who}</span>
          <span className="ml-3">{fmtDateTime(entry.createdAt)}</span>
        </div>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-slate-100 px-4 py-3 text-xs md:grid-cols-2">
          <PreBlock title="Avant" payload={entry.before} />
          <PreBlock title="Après" payload={entry.after} />
          {entry.ip && (
            <div className="text-slate-500">
              IP : <code className="rounded bg-slate-100 px-1 py-0.5">{entry.ip}</code>
            </div>
          )}
          {entry.userAgent && <div className="truncate text-slate-500">UA : {entry.userAgent}</div>}
        </div>
      )}
    </div>
  );
}

const JARVIS_STATUS: Record<JarvisAction["status"], { label: string; cls: string }> = {
  executed: { label: "Fait", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  scheduled: { label: "Programmée", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  awaiting_approval: { label: "À valider", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  cancelled: { label: "Annulée", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  failed: { label: "Échec", cls: "bg-red-50 text-red-800 border-red-200" },
};

function JarvisEntry({ action }: { action: JarvisAction }) {
  const [open, setOpen] = useState(false);
  const status = JARVIS_STATUS[action.status];
  const date = action.executedAt ?? action.cancelledAt ?? action.createdAt;
  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: "#AFA9EC" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="ti ti-sparkles shrink-0"
            style={{ color: "#534AB7" }}
            aria-hidden="true"
          />
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.cls}`}
          >
            {status.label}
          </span>
          <span className="truncate text-slate-700">{action.summary}</span>
          <span className="shrink-0 text-xs text-slate-400">{action.type}</span>
        </div>
        <div className="shrink-0 text-xs text-slate-500">
          par{" "}
          <span className="font-medium" style={{ color: "#534AB7" }}>
            Jarvis
          </span>
          <span className="ml-3">{fmtDateTime(date)}</span>
        </div>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-slate-100 px-4 py-3 text-xs md:grid-cols-2">
          <PreBlock title="Payload" payload={action.payload} />
          <PreBlock title="Résultat" payload={action.result} />
        </div>
      )}
    </div>
  );
}

function PreBlock({ title, payload }: { title: string; payload: unknown }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500">{title}</div>
      <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-700">
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
        : "bg-slate-100 text-slate-700 border-slate-200";
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
