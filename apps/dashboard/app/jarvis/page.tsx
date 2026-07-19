"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type JarvisAction,
  type JarvisActionStatus,
  type JarvisBrief,
  type JarvisChatMessage,
  type JarvisPolicy,
  type JarvisToolStatus,
  approveJarvisAction,
  cancelJarvisAction,
  chatWithJarvis,
  getCurrentTenantId,
  getJarvisBrief,
  listJarvisActions,
  listJarvisTools,
  patchJarvisTool,
  regenerateJarvisBrief,
  voiceChatJarvis,
} from "../_lib/api-client";
import { playAudioBase64, speak, useMicRecorder, useVoiceInput } from "../_lib/use-voice";

const STATUS_LABEL: Record<JarvisActionStatus, string> = {
  awaiting_approval: "À valider",
  scheduled: "Programmée",
  executed: "Faite",
  cancelled: "Annulée",
  failed: "Échouée",
};

const STATUS_COLOR: Record<JarvisActionStatus, string> = {
  awaiting_approval: "bg-amber-100 text-amber-800",
  scheduled: "bg-blue-100 text-blue-800",
  executed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
  failed: "bg-rose-100 text-rose-800",
};

export default function JarvisPage() {
  return (
    <LoginGate>
      <JarvisView />
    </LoginGate>
  );
}

function JarvisView() {
  const [brief, setBrief] = useState<JarvisBrief | null>(null);
  const [briefErr, setBriefErr] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [actions, setActions] = useState<JarvisAction[]>([]);
  const [filter, setFilter] = useState<JarvisActionStatus | "all">("all");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBrief = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBriefErr(null);
    try {
      const res = await getJarvisBrief(tenantId);
      setBrief(res.data);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setBrief(null);
      if (status !== 404) setBriefErr("Impossible de charger le brief.");
    }
  }, []);

  const fetchActions = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      setErr("Aucun tenant sélectionné.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await listJarvisActions(tenantId, filter === "all" ? undefined : filter);
      setActions([...res.data].reverse());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur chargement");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  async function handleRegenerate() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setRegenerating(true);
    setBriefErr(null);
    try {
      const res = await regenerateJarvisBrief(tenantId);
      setBrief(res.data);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setBriefErr(
        code === "advisor_unavailable"
          ? "LLM non configuré sur l'API — brief indisponible."
          : "La régénération a échoué.",
      );
    } finally {
      setRegenerating(false);
    }
  }

  async function handleAction(kind: "approve" | "cancel", id: string) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    try {
      if (kind === "approve") await approveJarvisAction(tenantId, id);
      else await cancelJarvisAction(tenantId, id);
      await fetchActions();
    } catch (e) {
      alert(`Action échouée : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Jarvis</h1>
        <p className="mt-1 text-sm text-slate-500">
          Le brief du matin et tout ce que l&apos;agent a fait ou propose de faire. Les actions
          programmées restent annulables jusqu&apos;à la fin de leur fenêtre de retrait.
        </p>
      </div>

      <div className="mb-8 rounded-lg border border-indigo-200 bg-indigo-50/50 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-indigo-900">Brief de Jarvis</h2>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {regenerating ? "Génération…" : "Refaire le point"}
          </button>
        </div>
        {briefErr && <p className="text-sm text-rose-700">{briefErr}</p>}
        {!briefErr && brief && (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {brief.text}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {brief.at ? `Généré ${fmtRelative(brief.at)}` : "Généré à l'instant"}
              {typeof brief.eventCount === "number" && ` · ${brief.eventCount} événements analysés`}
              {typeof brief.pendingApprovals === "number" &&
                brief.pendingApprovals > 0 &&
                ` · ${brief.pendingApprovals} action(s) attendent ta validation`}
            </p>
          </>
        )}
        {!briefErr && !brief && (
          <p className="text-sm text-slate-500">
            Aucun brief pour l&apos;instant — il arrive chaque matin à 8h, ou clique sur « Refaire
            le point ».
          </p>
        )}
      </div>

      <JarvisChat />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Jarvis a agi pour toi</h2>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as JarvisActionStatus | "all")}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="all">Toutes</option>
            <option value="awaiting_approval">À valider</option>
            <option value="scheduled">Programmées</option>
            <option value="executed">Faites</option>
            <option value="cancelled">Annulées</option>
            <option value="failed">Échouées</option>
          </select>
          <button
            type="button"
            onClick={fetchActions}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Recharger
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      )}

      {loading && actions.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Chargement…
        </div>
      ) : actions.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Aucune action pour l&apos;instant. Jarvis en proposera dès qu&apos;il aura matière à agir.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Annulable jusqu&apos;à</th>
                <th className="px-4 py-2">Créée</th>
                <th className="px-4 py-2 text-right">Décision</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{a.summary}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[a.status]}`}
                    >
                      {STATUS_LABEL[a.status]}
                    </span>
                    {a.status === "failed" && a.result?.error != null && (
                      <div className="mt-1 text-xs text-rose-700">{String(a.result.error)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {a.status === "scheduled" && a.cancellableUntil
                      ? fmtDateTime(a.cancellableUntil)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtRelative(a.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2 text-xs">
                      {a.status === "awaiting_approval" && (
                        <button
                          type="button"
                          onClick={() => handleAction("approve", a.id)}
                          className="rounded bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-500"
                        >
                          Valider
                        </button>
                      )}
                      {(a.status === "awaiting_approval" ||
                        (a.status === "scheduled" && isCancellable(a))) && (
                        <button
                          type="button"
                          onClick={() => handleAction("cancel", a.id)}
                          className="text-rose-700 hover:underline"
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <JarvisToolShop />
    </div>
  );
}

const POLICY_LABEL: Record<JarvisPolicy, string> = {
  auto: "Automatique",
  auto_cancellable: "Annulable 24 h",
  approval: "Sur validation",
};

function JarvisToolShop() {
  const [tools, setTools] = useState<JarvisToolStatus[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setErr(null);
    try {
      const res = await listJarvisTools(tenantId);
      setTools(res.data);
    } catch (e) {
      const status = (e as { status?: number }).status;
      // 404 = API sans le module (pas encore déployé) : section masquée.
      if (status !== 404) setErr("Impossible de charger la boutique.");
      setTools([]);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  async function handlePatch(
    type: string,
    patch: { enabled?: boolean; policyOverride?: JarvisPolicy | null },
  ) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBusy(type);
    try {
      await patchJarvisTool(tenantId, type, patch);
      await fetchTools();
    } catch (e) {
      alert(`Réglage échoué : ${e instanceof Error ? e.message : "erreur"}`);
    } finally {
      setBusy(null);
    }
  }

  if (tools.length === 0 && !err) return null;

  return (
    <div className="mt-10">
      <div className="mb-1">
        <h2 className="text-lg font-semibold tracking-tight">Boutique d&apos;automatisations</h2>
        <p className="mt-1 text-sm text-slate-500">
          Chaque boucle autonome peut être coupée ou passée sur validation. Une boucle coupée ne
          propose plus rien ; ses actions déjà programmées sont retirées.
        </p>
      </div>
      {err && (
        <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <div
            key={tool.type}
            className={`rounded-lg border p-4 ${
              tool.enabled ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-75"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{tool.label}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{tool.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={tool.enabled}
                aria-label={`${tool.enabled ? "Désactiver" : "Activer"} ${tool.label}`}
                disabled={busy === tool.type}
                onClick={() => handlePatch(tool.type, { enabled: !tool.enabled })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  tool.enabled ? "bg-emerald-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    tool.enabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-slate-500">Politique :</span>
              <select
                value={tool.policyOverride ?? ""}
                disabled={busy === tool.type || !tool.enabled}
                onChange={(e) =>
                  handlePatch(tool.type, {
                    policyOverride: e.target.value === "" ? null : (e.target.value as JarvisPolicy),
                  })
                }
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
              >
                <option value="">{`Défaut (${POLICY_LABEL[tool.defaultPolicy]})`}</option>
                <option value="auto">Automatique</option>
                <option value="auto_cancellable">Annulable 24 h</option>
                <option value="approval">Sur validation</option>
              </select>
              <span className="ml-auto font-mono text-[10px] text-slate-400">{tool.type}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JarvisChat() {
  const [messages, setMessages] = useState<JarvisChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);

  async function handleSend(text?: string, fromVoice = false) {
    const tenantId = getCurrentTenantId();
    const question = (text ?? input).trim();
    if (!tenantId || !question || sending) return;

    const next: JarvisChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setSending(true);
    setChatErr(null);
    try {
      const res = await chatWithJarvis(tenantId, next);
      setMessages([...next, { role: "model", content: res.data.reply }]);
      if (fromVoice) speak(res.data.reply);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setChatErr(
        code === "advisor_unavailable"
          ? "LLM non configuré sur l'API — chat indisponible."
          : "Jarvis n'a pas pu répondre, réessaie.",
      );
      setMessages(messages);
      setInput(question);
    } finally {
      setSending(false);
    }
  }

  // Voix serveur (Deepgram + vraie voix ElevenLabs) en priorité ; si l'API
  // voix n'est pas configurée, on retombe sur la reco navigateur (Web Speech).
  const [serverVoiceOff, setServerVoiceOff] = useState(false);

  async function handleVoiceAudio(audioBase64: string, mime: string) {
    const tenantId = getCurrentTenantId();
    if (!tenantId || sending) return;
    setSending(true);
    setChatErr(null);
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
        setChatErr("Voix serveur non configurée — bascule sur la reco du navigateur.");
      } else if (code === "empty_transcript") {
        setChatErr("Je n'ai rien entendu — réessaie en parlant plus près du micro.");
      } else {
        setChatErr("Jarvis n'a pas pu répondre, réessaie.");
      }
    } finally {
      setSending(false);
    }
  }

  const mic = useMicRecorder({
    onAudio: (audioBase64, mime) => void handleVoiceAudio(audioBase64, mime),
    onError: setChatErr,
  });
  const voice = useVoiceInput({
    onInterim: setInput,
    onFinal: (text) => handleSend(text, true),
  });
  const useServerVoice = mic.supported && !serverVoiceOff;
  const micActive = useServerVoice ? mic.recording : voice.listening;
  const micSupported = useServerVoice || voice.supported;
  const micToggle = useServerVoice ? mic.toggle : voice.toggle;

  return (
    <div className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold">Demander à Jarvis</h2>
      <div className="mb-3 max-h-72 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">
            Pose une question sur ton activité : « Combien de résas cette semaine ? », « Des avis
            négatifs récents ? », « Qu&apos;est-ce que tu as fait aujourd&apos;hui ? »
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${i}-${m.role}`}
            className={
              m.role === "user"
                ? "ml-auto w-fit max-w-[85%] rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                : "w-fit max-w-[85%] rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800"
            }
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="w-fit rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-400">…</div>
        )}
      </div>
      {chatErr && <p className="mb-2 text-xs text-rose-700">{chatErr}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Pose ta question…"
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={micToggle}
          disabled={!micSupported || sending}
          aria-label={micActive ? "Arrêter l'écoute" : "Parler à Jarvis"}
          title={
            micSupported
              ? micActive
                ? "J'écoute… clique pour envoyer"
                : "Parler à Jarvis"
              : "Vocal non supporté par ce navigateur"
          }
          className={`flex items-center justify-center rounded border px-2.5 py-1.5 ${
            micActive
              ? "animate-pulse border-rose-400 bg-rose-50 text-rose-600"
              : "border-slate-300 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          }`}
        >
          <span className="ti ti-microphone text-[15px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={sending || input.trim().length === 0}
          className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}

function isCancellable(a: JarvisAction): boolean {
  if (a.policy === "auto") return true;
  if (!a.cancellableUntil) return true;
  return new Date(a.cancellableUntil).getTime() > Date.now();
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `il y a ${diffD}j`;
}
