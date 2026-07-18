"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type ApiError,
  type VoiceCall,
  type VoiceHealth,
  type VoiceProfile,
  type VoiceSampleInput,
  createVoiceProfile,
  deleteVoiceProfile,
  getCurrentTenantId,
  getVoiceHealth,
  getVoiceProfile,
  listVoiceCalls,
  previewVoiceProfile,
} from "../_lib/api-client";

/**
 * Voix clonée (voice cloning, vague 4).
 *
 * Le patron uploade quelques échantillons audio de sa voix, signe le
 * consentement, et le bot téléphonique parle avec sa voix (clone ElevenLabs).
 * Sans profil, le pipeline garde la voix par défaut.
 */

const ACCEPTED_MIMES = ["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4"];
const MAX_SAMPLE_BYTES = 6 * 1024 * 1024;
const DEFAULT_CONSENT_TEXT =
  "Je consens à ce que ma voix soit clonée et utilisée par l'assistant téléphonique de mon établissement. Je peux retirer ce consentement à tout moment en supprimant le profil vocal.";

export default function VoicePage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (tid: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getVoiceProfile(tid);
      setProfile(data);
    } catch (e) {
      setError((e as ApiError).message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tid = getCurrentTenantId();
    setTenantId(tid);
    if (tid) void refresh(tid);
    else setLoading(false);
  }, [refresh]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Voix clonée</h1>
      <p className="mt-1 text-sm text-stone-500">
        L'assistant téléphonique parle avec la voix du patron. Sans profil, il garde la voix par
        défaut.
      </p>

      {!tenantId && !loading && (
        <div className="mt-6 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Sélectionne d'abord un établissement (aucun tenant courant).
        </div>
      )}
      {error && (
        <div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && <div className="mt-6 text-sm text-stone-500">Chargement…</div>}

      {tenantId && !loading && profile && (
        <ProfileCard
          profile={profile}
          tenantId={tenantId}
          onDelete={async () => {
            if (
              !window.confirm("Supprimer le clone vocal ? Le bot reprendra la voix par défaut.")
            ) {
              return;
            }
            try {
              await deleteVoiceProfile(tenantId);
              await refresh(tenantId);
            } catch (e) {
              setError((e as ApiError).message ?? "Suppression échouée");
            }
          }}
        />
      )}

      {tenantId && !loading && !error && !profile && (
        <CreateForm tenantId={tenantId} onCreated={() => refresh(tenantId)} />
      )}

      {tenantId && !loading && !error && (
        <>
          <HealthCard tenantId={tenantId} />
          <CallsCard tenantId={tenantId} />
        </>
      )}
    </div>
  );
}

/** Santé du pipeline : « prêt à recevoir un appel ? » avant de composer. */
function HealthCard({ tenantId }: { tenantId: string }) {
  const [health, setHealth] = useState<VoiceHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await getVoiceHealth(tenantId);
      setHealth(data);
    } catch (e) {
      setErr((e as ApiError).message ?? "Vérification échouée");
    } finally {
      setBusy(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <div className="mt-6 rounded-lg border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Santé du pipeline</h2>
        <button
          type="button"
          onClick={() => void check()}
          disabled={busy}
          className="rounded border border-stone-300 px-3 py-1 text-xs hover:bg-stone-50 disabled:opacity-50"
        >
          {busy ? "Vérification…" : "Re-vérifier"}
        </button>
      </div>
      {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
      {health && (
        <div className="mt-3 space-y-2 text-sm">
          <div
            className={
              health.ready
                ? "rounded bg-emerald-50 px-3 py-2 font-medium text-emerald-800"
                : "rounded bg-amber-50 px-3 py-2 font-medium text-amber-800"
            }
          >
            {health.ready
              ? "✓ Prêt à recevoir un appel"
              : "✗ Pas prêt — voir les points ci-dessous"}
          </div>
          <HealthLine
            label="Deepgram (STT)"
            ok={health.deepgram.ok}
            detail={
              health.deepgram.ok
                ? `${health.deepgram.latencyMs} ms`
                : (health.deepgram.error ?? "?")
            }
          />
          <HealthLine
            label="ElevenLabs (TTS)"
            ok={health.elevenlabs.ok}
            detail={
              health.elevenlabs.ok
                ? `${health.elevenlabs.latencyMs} ms`
                : (health.elevenlabs.error ?? "?")
            }
          />
          <HealthLine
            label="Streaming Twilio configuré"
            ok={health.streamConfigured}
            detail={health.streamConfigured ? "secret + URL publique posés" : "env manquantes"}
          />
          <HealthLine
            label="Clone vocal"
            ok={health.cloneActive}
            detail={health.cloneActive ? "voix clonée active" : "voix par défaut"}
            neutral={!health.cloneActive}
          />
        </div>
      )}
    </div>
  );
}

function HealthLine({
  label,
  ok,
  detail,
  neutral = false,
}: {
  label: string;
  ok: boolean;
  detail: string;
  neutral?: boolean;
}) {
  const icon = ok ? "✓" : neutral ? "—" : "✗";
  const color = ok ? "text-emerald-700" : neutral ? "text-stone-400" : "text-red-700";
  return (
    <div className="flex items-center justify-between border-b border-stone-100 pb-1.5 last:border-0">
      <span className="text-stone-600">{label}</span>
      <span className={`${color} text-xs`}>
        {icon} {detail}
      </span>
    </div>
  );
}

/** Latences mesurées sur les derniers appels réels (journal en mémoire API). */
function CallsCard({ tenantId }: { tenantId: string }) {
  const [calls, setCalls] = useState<VoiceCall[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { data } = await listVoiceCalls(tenantId);
      setCalls(data);
    } catch (e) {
      setErr((e as ApiError).message ?? "Chargement échoué");
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-6 rounded-lg border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Derniers appels</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-stone-300 px-3 py-1 text-xs hover:bg-stone-50"
        >
          Rafraîchir
        </button>
      </div>
      {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
      {calls && calls.length === 0 && (
        <p className="mt-3 text-sm text-stone-500">
          Aucun appel enregistré depuis le démarrage de l'API. Les latences par tour (LLM, premier
          son, total) apparaîtront ici dès le premier appel réel.
        </p>
      )}
      {calls && calls.length > 0 && (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-400">
              <th className="py-1.5 pr-2 font-medium">Appel</th>
              <th className="py-1.5 pr-2 font-medium">Heure</th>
              <th className="py-1.5 pr-2 font-medium">Tours</th>
              <th className="py-1.5 pr-2 font-medium">LLM méd.</th>
              <th className="py-1.5 pr-2 font-medium">1er son méd.</th>
              <th className="py-1.5 font-medium">Barge-in</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => {
              const llm = median(call.turns.map((t) => t.llmMs));
              const first = median(call.turns.map((t) => t.llmMs + t.ttsFirstChunkMs));
              const interrupted = call.turns.filter((t) => t.interrupted).length;
              return (
                <tr key={call.callSid} className="border-b border-stone-100 last:border-0">
                  <td className="py-1.5 pr-2 font-mono text-xs">{call.callSid.slice(0, 10)}…</td>
                  <td className="py-1.5 pr-2">
                    {new Date(call.startedAt).toLocaleTimeString("fr-FR")}
                  </td>
                  <td className="py-1.5 pr-2">{call.turns.length}</td>
                  <td className="py-1.5 pr-2">{llm === null ? "—" : `${llm} ms`}</td>
                  <td className="py-1.5 pr-2">{first === null ? "—" : `${first} ms`}</td>
                  <td className="py-1.5">{interrupted || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round(value ?? 0);
}

function ProfileCard({
  profile,
  tenantId,
  onDelete,
}: {
  profile: VoiceProfile;
  tenantId: string;
  onDelete: () => void;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function playPreview() {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await previewVoiceProfile(tenantId);
      const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.mime });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e) {
      setErr((e as ApiError).message ?? "Écoute échouée");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{profile.label}</div>
          <div className="mt-0.5 text-xs text-stone-500">
            voiceId <code className="rounded bg-stone-100 px-1">{profile.voiceId}</code>
          </div>
        </div>
        <span
          className={
            profile.status === "active"
              ? "rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
              : "rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-500"
          }
        >
          {profile.status === "active" ? "active" : profile.status}
        </span>
      </div>
      <div className="mt-4 rounded border border-stone-100 bg-stone-50 p-3 text-xs text-stone-600">
        Consentement donné par <strong>{profile.consentGivenBy}</strong> le{" "}
        {new Date(profile.consentAt).toLocaleString("fr-FR")}.
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void playPreview()}
          disabled={busy || profile.status !== "active"}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
        >
          {busy ? "Génération…" : "Écouter un extrait"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          Supprimer le clone
        </button>
      </div>
      {audioUrl && (
        <audio src={audioUrl} controls className="mt-3 w-full">
          <track kind="captions" />
        </audio>
      )}
      {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
    </div>
  );
}

function CreateForm({ tenantId, onCreated }: { tenantId: string; onCreated: () => void }) {
  const [label, setLabel] = useState("Voix du patron");
  const [givenBy, setGivenBy] = useState("");
  const [consented, setConsented] = useState(false);
  const [samples, setSamples] = useState<VoiceSampleInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setErr(null);
    const next: VoiceSampleInput[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_MIMES.includes(file.type)) {
        setErr(`Format non supporté : ${file.name} (${file.type || "inconnu"})`);
        return;
      }
      if (file.size === 0 || file.size > MAX_SAMPLE_BYTES) {
        setErr(`${file.name} : vide ou > 6 Mo`);
        return;
      }
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      // btoa par blocs (évite un dépassement de pile d'arguments sur les gros fichiers)
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      next.push({ audioBase64: btoa(binary), mime: file.type, filename: file.name });
    }
    setSamples(next);
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await createVoiceProfile(tenantId, {
        label,
        samples,
        consent: { givenBy: givenBy.trim(), text: DEFAULT_CONSENT_TEXT },
      });
      onCreated();
    } catch (e) {
      setErr((e as ApiError).message ?? "Clonage échoué");
    } finally {
      setBusy(false);
    }
  }

  const ready = consented && givenBy.trim().length > 0 && samples.length > 0 && !busy;

  return (
    <div className="mt-6 rounded-lg border border-stone-200 bg-white p-5">
      <h2 className="font-medium">Créer le clone vocal</h2>
      <p className="mt-1 text-xs text-stone-500">
        1 à 10 échantillons audio (mp3, wav, ogg, webm, m4a — max 6 Mo chacun). Une à deux minutes
        de parole naturelle suffisent.
      </p>

      <label className="mt-4 block text-sm">
        Nom du profil
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="mt-3 block text-sm">
        Échantillons audio
        <input
          type="file"
          accept={ACCEPTED_MIMES.join(",")}
          multiple
          onChange={(e) => void handleFiles(e.target.files)}
          className="mt-1 block w-full text-sm text-stone-600 file:mr-3 file:rounded file:border-0 file:bg-stone-900 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-stone-700"
        />
      </label>
      {samples.length > 0 && (
        <div className="mt-2 text-xs text-stone-500">
          {samples.length} fichier{samples.length > 1 ? "s" : ""} prêt
          {samples.length > 1 ? "s" : ""} : {samples.map((s) => s.filename).join(", ")}
        </div>
      )}

      <div className="mt-4 rounded border border-stone-100 bg-stone-50 p-3">
        <div className="text-xs text-stone-600">{DEFAULT_CONSENT_TEXT}</div>
        <label className="mt-3 block text-sm">
          Nom de la personne qui consent
          <input
            value={givenBy}
            onChange={(e) => setGivenBy(e.target.value)}
            placeholder="Prénom Nom"
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5"
          />
          <span>C'est ma voix et je donne mon consentement explicite au clonage.</span>
        </label>
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={() => void submit()}
        className="mt-4 rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {busy ? "Clonage en cours…" : "Cloner la voix"}
      </button>
      {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
    </div>
  );
}
