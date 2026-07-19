"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type JarvisAction,
  type JarvisBrief,
  type JarvisChatMessage,
  type ReviewSummary,
  type SiteAnalytics,
  chatWithJarvis,
  getCurrentTenantId,
  getJarvisBrief,
  getReviewSummary,
  getSiteAnalytics,
  listInvoices,
  listJarvisActions,
  listReservations,
  regenerateJarvisBrief,
  voiceChatJarvis,
} from "../_lib/api-client";
import { playAudioBase64, speak, useMicRecorder, useVoiceInput } from "../_lib/use-voice";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function OverviewPage() {
  return (
    <LoginGate>
      <Overview />
    </LoginGate>
  );
}

/**
 * Home post-refonte : brief Jarvis conversationnel plein écran.
 * KPIs + actions récentes en panneau latéral droit, replié par défaut sur
 * petit écran. Style Vercel : blanc pur, monospace pour les chiffres, un
 * seul accent indigo pour l'action primaire.
 */
function Overview() {
  const [sideOpen, setSideOpen] = useState(true);
  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem-3rem)] max-w-6xl gap-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <JarvisThread />
      </div>
      <aside
        className={`${
          sideOpen ? "w-72" : "w-10"
        } okito-hairline hidden shrink-0 flex-col overflow-hidden rounded-[12px] bg-white transition-all lg:flex`}
      >
        <button
          type="button"
          onClick={() => setSideOpen((v) => !v)}
          className="okito-hairline-b flex items-center gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 hover:bg-slate-50"
        >
          <span
            className={`ti ${sideOpen ? "ti-chevron-right" : "ti-chevron-left"} text-[13px]`}
            aria-hidden="true"
          />
          {sideOpen && <span>Coup d'œil</span>}
        </button>
        {sideOpen && (
          <div className="flex-1 overflow-y-auto p-3">
            <Indicators />
            <RecentActions />
          </div>
        )}
      </aside>
    </div>
  );
}

/**
 * Thread conversationnel : ouvre par le brief Jarvis (fetch/regénère), puis
 * l'utilisateur peut discuter dans la même fenêtre.
 */
function JarvisThread() {
  const [brief, setBrief] = useState<JarvisBrief | null>(null);
  const [briefState, setBriefState] = useState<"loading" | "empty" | "ready" | "unavailable">(
    "loading",
  );
  const [briefBusy, setBriefBusy] = useState(false);
  const [messages, setMessages] = useState<JarvisChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadBrief = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    try {
      const res = await getJarvisBrief(tenantId);
      setBrief(res.data);
      setBriefState("ready");
    } catch {
      setBriefState("empty");
    }
  }, []);

  useEffect(() => {
    loadBrief();
  }, [loadBrief]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: on veut re-scroll à chaque changement
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, briefState, sending]);

  async function regenerateBrief() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBriefBusy(true);
    try {
      const res = await regenerateJarvisBrief(tenantId);
      setBrief(res.data);
      setBriefState("ready");
    } catch (e) {
      setBriefState(
        (e as { code?: string }).code === "advisor_unavailable" ? "unavailable" : "empty",
      );
    } finally {
      setBriefBusy(false);
    }
  }

  async function send(text?: string, fromVoice = false) {
    const tenantId = getCurrentTenantId();
    const q = (text ?? input).trim();
    if (!tenantId || !q || sending) return;
    const next: JarvisChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setSending(true);
    setErr(null);
    try {
      const res = await chatWithJarvis(tenantId, next);
      setMessages([...next, { role: "model", content: res.data.reply }]);
      if (fromVoice) speak(res.data.reply);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setErr(code === "advisor_unavailable" ? "LLM non configuré." : "Jarvis n'a pas pu répondre.");
      setMessages(messages);
      setInput(q);
    } finally {
      setSending(false);
    }
  }

  const [serverVoiceOff, setServerVoiceOff] = useState(false);

  async function sendVoiceAudio(audioBase64: string, mime: string) {
    const tenantId = getCurrentTenantId();
    if (!tenantId || sending) return;
    setSending(true);
    setErr(null);
    try {
      const res = await voiceChatJarvis(tenantId, {
        audioBase64,
        mime,
        history: messages.slice(-18),
      });
      setMessages([
        ...messages,
        { role: "user", content: res.data.transcript },
        { role: "model", content: res.data.reply },
      ]);
      playAudioBase64(res.data.audioBase64, res.data.mime);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "voice_unavailable") {
        setServerVoiceOff(true);
        setErr("Voix serveur non configurée — bascule sur la reco du navigateur.");
      } else if (code === "empty_transcript") {
        setErr("Je n'ai rien entendu — réessaie.");
      } else {
        setErr("Jarvis n'a pas pu répondre.");
      }
    } finally {
      setSending(false);
    }
  }

  const mic = useMicRecorder({
    onAudio: (audioBase64, mime) => void sendVoiceAudio(audioBase64, mime),
    onError: setErr,
  });
  const voice = useVoiceInput({
    onInterim: setInput,
    onFinal: (text) => send(text, true),
  });
  const useServerVoice = mic.supported && !serverVoiceOff;
  const micActive = useServerVoice ? mic.recording : voice.listening;
  const micSupported = useServerVoice || voice.supported;
  const micToggle = useServerVoice ? mic.toggle : voice.toggle;

  return (
    <div className="okito-hairline flex min-h-0 flex-1 flex-col rounded-[12px] bg-white">
      <div className="okito-hairline-b flex items-center gap-2 px-4 py-2.5">
        <span className="ti ti-sparkles text-[15px] text-indigo-600" aria-hidden="true" />
        <h1 className="text-sm font-medium">Jarvis</h1>
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
          Mode auto
        </span>
        <button
          type="button"
          onClick={regenerateBrief}
          disabled={briefBusy}
          className="ml-auto text-[11px] text-slate-500 hover:text-slate-900 disabled:opacity-50"
        >
          {briefBusy ? "Génération…" : "Refaire le point"}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {briefState === "loading" && <MsgSkeleton />}
        {briefState !== "loading" && (
          <MsgModel>
            {briefState === "ready" && brief ? (
              <>
                <div className="whitespace-pre-wrap leading-relaxed">{brief.text}</div>
                {(brief.pendingApprovals ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      href="/jarvis"
                      className="okito-hairline rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800"
                    >
                      <span className="ti ti-alert-triangle mr-1" aria-hidden="true" />
                      {brief.pendingApprovals} action(s) à valider
                    </Link>
                  </div>
                )}
              </>
            ) : briefState === "unavailable" ? (
              <span>Le brief nécessite un LLM configuré côté API (GEMINI_API_KEY).</span>
            ) : (
              <span>
                Bonjour. Je n'ai pas encore fait le point de ta journée — clique sur « Refaire le
                point » ou pose-moi une question directement.
              </span>
            )}
          </MsgModel>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <MsgUser key={`u-${i}-${m.content.slice(0, 8)}`}>{m.content}</MsgUser>
          ) : (
            <MsgModel key={`m-${i}-${m.content.slice(0, 8)}`}>{m.content}</MsgModel>
          ),
        )}
        {sending && <MsgSkeleton />}
      </div>

      {err && (
        <div className="px-4 pb-2 text-[11px] text-rose-700" role="alert">
          {err}
        </div>
      )}
      <div className="okito-hairline-t flex items-center gap-2 px-3 py-2.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Parle à Jarvis…"
          className="okito-hairline min-w-0 flex-1 rounded-md bg-white px-3 py-1.5 text-[13px] outline-none focus:border-indigo-400"
        />
        <button
          type="button"
          onClick={micToggle}
          disabled={!micSupported || sending}
          aria-label={micActive ? "Arrêter l'écoute" : "Parler à Jarvis"}
          className={`okito-hairline flex items-center justify-center rounded-md px-2.5 py-1.5 ${
            micActive
              ? "animate-pulse border-rose-400 bg-rose-50 text-rose-600"
              : "text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          }`}
        >
          <span className="ti ti-microphone text-[15px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => send()}
          disabled={sending || !input.trim()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}

function MsgModel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span
        className="ti ti-sparkles mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[13px] text-indigo-600"
        aria-hidden="true"
      />
      <div className="max-w-[85%] rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-800">
        {children}
      </div>
    </div>
  );
}

function MsgUser({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-auto max-w-[85%] rounded-xl bg-black px-3 py-2 text-[13px] text-white">
      {children}
    </div>
  );
}

function MsgSkeleton() {
  return (
    <div className="flex gap-2.5">
      <span
        className="ti ti-sparkles mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[13px] text-indigo-600"
        aria-hidden="true"
      />
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-400">…</div>
    </div>
  );
}

function Indicators() {
  const [reservations, setReservations] = useState<number | null>(null);
  const [reviews, setReviews] = useState<ReviewSummary | null>(null);
  const [revenueCents, setRevenueCents] = useState<number | null>(null);
  const [visits, setVisits] = useState<SiteAnalytics | null>(null);

  useEffect(() => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    getSiteAnalytics(tenantId)
      .then((r) => setVisits(r.data))
      .catch(() => setVisits(null));
    listReservations(todayIso())
      .then((r) => setReservations(r.data.length))
      .catch(() => setReservations(null));
    getReviewSummary(tenantId)
      .then((r) => setReviews(r.data))
      .catch(() => setReviews(null));
    listInvoices(tenantId, "paid")
      .then((r) => {
        const today = todayIso();
        const sum = r.data
          .filter((inv) => inv.paidAt?.slice(0, 10) === today)
          .reduce((acc, inv) => acc + inv.amountCents, 0);
        setRevenueCents(sum);
      })
      .catch(() => setRevenueCents(null));
  }, []);

  const revenue =
    revenueCents === null
      ? null
      : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
          revenueCents / 100,
        );

  return (
    <div className="mb-4">
      <div className="pb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Aujourd'hui
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Chiffre" value={revenue ?? "—"} href="/admin" />
        <Metric
          label="Visites"
          value={visits === null ? "—" : String(visits.today)}
          href="/integrations"
        />
        <Metric
          label="Résas"
          value={reservations === null ? "—" : String(reservations)}
          href="/reservations"
        />
        <Metric
          label="Note"
          value={reviews && reviews.count > 0 ? `${reviews.average}★` : "—"}
          href="/loyalty"
        />
      </div>
    </div>
  );
}

function Metric({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="okito-hairline rounded-md bg-white px-2.5 py-2 hover:bg-slate-50">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="okito-num mt-0.5 text-base text-slate-900">{value}</div>
    </Link>
  );
}

const ACTION_ICON: Record<string, string> = {
  "review.reply": "ti-star",
  "invoice.remind": "ti-file-invoice",
  "email.reply": "ti-mail",
  "reservation.confirm": "ti-calendar-check",
  "reminder.send": "ti-bell",
};

function RecentActions() {
  const [actions, setActions] = useState<JarvisAction[] | null>(null);

  useEffect(() => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    listJarvisActions(tenantId)
      .then((r) => setActions([...r.data].reverse().slice(0, 5)))
      .catch(() => setActions([]));
  }, []);

  return (
    <div>
      <div className="flex items-center pb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Jarvis a agi
        <Link href="/jarvis" className="ml-auto normal-case hover:text-slate-700">
          voir tout
        </Link>
      </div>
      {actions === null ? (
        <p className="text-[11px] text-slate-400">…</p>
      ) : actions.length === 0 ? (
        <p className="text-[11px] text-slate-400">Rien pour l'instant.</p>
      ) : (
        <div className="okito-hairline divide-y divide-slate-100 rounded-md bg-white">
          {actions.map((a) => (
            <div key={a.id} className="flex items-start gap-2 px-2.5 py-2">
              <span
                className={`ti ${ACTION_ICON[a.type] ?? "ti-point"} mt-0.5 text-[13px] text-slate-400`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 text-[12px] text-slate-700">
                <div className="truncate">{a.summary}</div>
              </div>
              <ActionBadge status={a.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBadge({ status }: { status: JarvisAction["status"] }) {
  const map: Record<JarvisAction["status"], { label: string; cls: string }> = {
    awaiting_approval: { label: "•", cls: "text-amber-600" },
    scheduled: { label: "•", cls: "text-blue-600" },
    executed: { label: "•", cls: "text-emerald-600" },
    cancelled: { label: "•", cls: "text-slate-400" },
    failed: { label: "•", cls: "text-rose-600" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-[10px] ${cls}`} aria-label={status}>
      {label}
    </span>
  );
}
