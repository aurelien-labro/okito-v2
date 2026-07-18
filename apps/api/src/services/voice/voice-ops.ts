import { logger } from "../../lib/logger.js";
import type { VoiceProfileService } from "./voice-profile.js";

/**
 * Opérations du pipeline voix (vague 4) :
 *
 * - `health(tenantId)` : ping Deepgram + ElevenLabs avec les clés réelles et
 *   dit si le pipeline est « prêt à recevoir un appel » AVANT de composer le
 *   numéro (clé morte, quota épuisé, stream non configuré…).
 * - journal des appels : latences mesurées par tour (LLM, premier chunk TTS,
 *   total) gardées en mémoire (ring buffer) et servies au dashboard /voice.
 *   Pas de table dédiée : c'est un outil d'exploitation, pas un historique
 *   métier — un redémarrage repart à vide.
 */

const DEEPGRAM_PING_URL = "https://api.deepgram.com/v1/auth/token";
const ELEVENLABS_PING_URL = "https://api.elevenlabs.io/v1/user";
const PING_TIMEOUT_MS = 5000;
const MAX_CALLS = 50;

export interface ProviderCheck {
  ok: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
}

export interface VoiceHealth {
  /** Tout est vert : deepgram + elevenlabs OK et streaming Twilio configuré. */
  ready: boolean;
  deepgram: ProviderCheck;
  elevenlabs: ProviderCheck;
  /** VOICE_STREAM_SECRET + VOICE_STREAM_PUBLIC_URL posées (WS Twilio montable). */
  streamConfigured: boolean;
  /** Le tenant a un clone vocal actif (sinon voix par défaut). */
  cloneActive: boolean;
}

/** Latences d'un tour de parole (mesurées depuis la fin de parole du client). */
export interface TurnMetrics {
  /** Génération de la réponse (ChatService / LLM). */
  llmMs: number;
  /** Fin du LLM → premier chunk audio envoyé à Twilio. */
  ttsFirstChunkMs: number;
  /** Fin de parole client → dernier chunk envoyé. */
  totalMs: number;
  /** Tour interrompu par un barge-in du client. */
  interrupted: boolean;
}

export interface VoiceCall {
  callSid: string;
  tenantId: string;
  startedAt: Date;
  turns: TurnMetrics[];
}

export class VoiceOpsService {
  private readonly calls: VoiceCall[] = [];

  constructor(
    private readonly deepgramKey: string,
    private readonly elevenLabsKey: string,
    private readonly streamConfigured: boolean,
    private readonly voiceProfile?: VoiceProfileService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async health(tenantId: string): Promise<VoiceHealth> {
    const [deepgram, elevenlabs, cloneActive] = await Promise.all([
      this.ping(DEEPGRAM_PING_URL, { Authorization: `Token ${this.deepgramKey}` }),
      this.ping(ELEVENLABS_PING_URL, { "xi-api-key": this.elevenLabsKey }),
      this.voiceProfile
        ? this.voiceProfile.voiceIdFor(tenantId).then(Boolean)
        : Promise.resolve(false),
    ]);
    return {
      ready: deepgram.ok && elevenlabs.ok && this.streamConfigured,
      deepgram,
      elevenlabs,
      streamConfigured: this.streamConfigured,
      cloneActive,
    };
  }

  /** Nouvel appel entrant (start du stream Twilio). */
  callStarted(callSid: string, tenantId: string): void {
    if (this.calls.some((c) => c.callSid === callSid)) return;
    this.calls.push({ callSid, tenantId, startedAt: new Date(), turns: [] });
    if (this.calls.length > MAX_CALLS) this.calls.shift();
    logger.info({ callSid, tenantId }, "voice ops: appel enregistré");
  }

  /** Latences d'un tour terminé (ou interrompu par barge-in). */
  recordTurn(callSid: string, metrics: TurnMetrics): void {
    const call = this.calls.find((c) => c.callSid === callSid);
    if (!call) return;
    call.turns.push(metrics);
  }

  /** Derniers appels du tenant, plus récent en premier. */
  listCalls(tenantId: string, limit = 20): VoiceCall[] {
    return this.calls
      .filter((c) => c.tenantId === tenantId)
      .slice(-limit)
      .reverse();
  }

  private async ping(url: string, headers: Record<string, string>): Promise<ProviderCheck> {
    const startedAt = Date.now();
    try {
      const res = await this.fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      return {
        ok: res.ok,
        latencyMs: Date.now() - startedAt,
        status: res.status,
        ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
