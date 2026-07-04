"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import { type InboxMessage, getCurrentTenantId, listInbox } from "../_lib/api-client";

export default function InboxPage() {
  return (
    <LoginGate>
      <InboxView />
    </LoginGate>
  );
}

function InboxView() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchFirst = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      setErr("Aucun tenant sélectionné.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await listInbox(tenantId, { limit: 30 });
      setMessages(res.data);
      setCursor(res.nextCursor);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFirst();
  }, [fetchFirst]);

  async function loadMore() {
    const tenantId = getCurrentTenantId();
    if (!tenantId || !cursor) return;
    setLoading(true);
    try {
      const res = await listInbox(tenantId, { limit: 30, before: cursor });
      setMessages((prev) => [...prev, ...res.data]);
      setCursor(res.nextCursor);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur chargement");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-stone-500">
            Les emails reçus sur les boîtes connectées. Jarvis les lit pour son brief et peut
            répondre aux plus simples.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchFirst}
          className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
        >
          Recharger
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      )}

      {loading && messages.length === 0 ? (
        <Empty>Chargement…</Empty>
      ) : messages.length === 0 ? (
        <Empty>
          Aucun email pour l&apos;instant. Connecte une boîte Gmail depuis Intégrations — les
          nouveaux emails apparaîtront ici sous 5 min.
        </Empty>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            {messages.map((m, i) => (
              <div
                key={m.id}
                className={`flex items-start gap-3 px-4 py-3 ${i < messages.length - 1 ? "border-b border-stone-100" : ""}`}
              >
                <span className="ti ti-mail mt-0.5 text-base text-stone-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{cleanFrom(m.from)}</span>
                    <span className="shrink-0 text-xs text-stone-400">{fmtDate(m)}</span>
                  </div>
                  <div className="truncate text-sm">{m.subject ?? "(sans objet)"}</div>
                  {m.snippet && <div className="truncate text-xs text-stone-400">{m.snippet}</div>}
                </div>
              </div>
            ))}
          </div>
          {cursor && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="rounded border border-stone-300 px-4 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-50"
              >
                {loading ? "…" : "Charger plus"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function cleanFrom(from: string | null): string {
  if (!from) return "Expéditeur inconnu";
  const match = from.match(/^\s*"?([^"<]+?)"?\s*<.+>$/);
  return match?.[1]?.trim() || from;
}

function fmtDate(m: InboxMessage): string {
  const iso = m.receivedAt ?? m.createdAt;
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-500">
      {children}
    </div>
  );
}
