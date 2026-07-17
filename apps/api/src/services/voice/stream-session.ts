import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "../../lib/logger.js";
import type { ChatService } from "../chat.js";
import type { SpeechToText } from "./stt.js";
import type { TextToSpeech } from "./tts.js";

/**
 * Session Twilio Media Streams (pipeline voix v2, vague 4).
 *
 * Twilio pousse l'audio du client en frames μ-law 8 kHz base64 (~20 ms).
 * Détection de fin de tour par silence (énergie μ-law sous un seuil pendant
 * SILENCE_MS après de la parole) → le tour part dans STT → ChatService
 * (channel voice, mémoire par callSid) → TTS ulaw_8000 → frames "media"
 * renvoyées à Twilio + "mark" de fin.
 *
 * v2 turn-based : le STT/TTS restent des appels REST par tour (latence ~2-3 s).
 * Le vrai streaming word-by-word (Deepgram live WS + ElevenLabs stream) se
 * branchera sur ces mêmes seams. Vapi reste le canal téléphone en prod.
 */

/** ~20 ms par frame Twilio ; 40 frames ≈ 800 ms de silence = fin de tour. */
const SILENCE_FRAMES_END_OF_TURN = 40;
/** Énergie moyenne (échantillons linéaires abs) sous laquelle une frame est du silence. */
const SILENCE_ENERGY = 200;
/** Un tour doit contenir au moins ~300 ms de parole pour partir en STT. */
const MIN_SPEECH_FRAMES = 15;
/** Garde-fou mémoire : ~60 s d'audio max par tour. */
const MAX_TURN_BYTES = 8000 * 60;

/** Table de décodage μ-law → PCM 16 bits (approx, suffisant pour l'énergie). */
function ulawToLinear(byte: number): number {
  const u = ~byte & 0xff;
  const sign = u & 0x80 ? -1 : 1;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  return sign * (((mantissa << 3) + 0x84) << exponent) - sign * 0x84;
}

function frameEnergy(frame: Buffer): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (const byte of frame) sum += Math.abs(ulawToLinear(byte));
  return sum / frame.length;
}

/** Jeton HMAC liant l'appel à un tenant (posé dans la TwiML, vérifié au start). */
export function voiceStreamToken(secret: string, tenantId: string): string {
  return createHmac("sha256", secret).update(tenantId).digest("hex");
}

export function verifyVoiceStreamToken(secret: string, tenantId: string, token: string): boolean {
  const expected = Buffer.from(voiceStreamToken(secret, tenantId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export interface StreamSessionDeps {
  stt: SpeechToText;
  tts: TextToSpeech;
  chat: ChatService;
  secret: string;
  /** Envoie un message JSON à Twilio (frame media, mark…). */
  send: (message: Record<string, unknown>) => void;
  /** Ferme la connexion (auth invalide, erreur fatale). */
  close: () => void;
}

interface TwilioMessage {
  event?: string;
  streamSid?: string;
  start?: {
    callSid?: string;
    customParameters?: Record<string, string>;
  };
  media?: { payload?: string };
}

export class VoiceStreamSession {
  private streamSid = "";
  private tenantId = "";
  private sessionKey = "";
  private turnFrames: Buffer[] = [];
  private turnBytes = 0;
  private speechFrames = 0;
  private silenceStreak = 0;
  private processing = false;

  constructor(private readonly deps: StreamSessionDeps) {}

  /** Un message WebSocket Twilio (JSON déjà parsé). */
  async handleMessage(raw: unknown): Promise<void> {
    const msg = raw as TwilioMessage;
    switch (msg.event) {
      case "start":
        return this.handleStart(msg);
      case "media":
        return this.handleMedia(msg);
      case "stop":
        logger.info({ streamSid: this.streamSid, tenantId: this.tenantId }, "voice: stream stop");
        return;
      default:
        return; // connected, mark, dtmf… ignorés en v2
    }
  }

  private handleStart(msg: TwilioMessage): void {
    const params = msg.start?.customParameters ?? {};
    const tenantId = params.tenantId ?? "";
    const token = params.token ?? "";
    if (!tenantId || !verifyVoiceStreamToken(this.deps.secret, tenantId, token)) {
      logger.warn({ streamSid: msg.streamSid }, "voice: token de stream invalide — fermeture");
      this.deps.close();
      return;
    }
    this.streamSid = msg.streamSid ?? "";
    this.tenantId = tenantId;
    // Mémoire de conversation par appel : le callSid Twilio est stable.
    this.sessionKey = `call-${msg.start?.callSid ?? this.streamSid}`;
    logger.info({ streamSid: this.streamSid, tenantId }, "voice: stream start");
  }

  private async handleMedia(msg: TwilioMessage): Promise<void> {
    if (!this.tenantId || !msg.media?.payload) return;
    const frame = Buffer.from(msg.media.payload, "base64");
    const speaking = frameEnergy(frame) >= SILENCE_ENERGY;

    if (speaking) {
      this.silenceStreak = 0;
      this.speechFrames++;
    } else {
      this.silenceStreak++;
    }
    if (this.turnBytes < MAX_TURN_BYTES) {
      this.turnFrames.push(frame);
      this.turnBytes += frame.length;
    }

    const endOfTurn =
      this.speechFrames >= MIN_SPEECH_FRAMES && this.silenceStreak >= SILENCE_FRAMES_END_OF_TURN;
    if (endOfTurn && !this.processing) await this.processTurn();
  }

  private async processTurn(): Promise<void> {
    this.processing = true;
    const audio = Buffer.concat(this.turnFrames);
    this.resetTurn();
    try {
      const { text } = await this.deps.stt.transcribe(audio, "audio/mulaw");
      if (!text) return;
      const response = await this.deps.chat.handle({
        tenantId: this.tenantId,
        channel: "voice",
        sessionKey: this.sessionKey,
        message: text,
      });
      const { audio: reply } = await this.deps.tts.synthesize(response.reply);
      this.sendAudio(reply);
    } catch (err) {
      logger.error({ err, streamSid: this.streamSid }, "voice: tour échoué");
    } finally {
      this.processing = false;
    }
  }

  /** Renvoie l'audio μ-law à Twilio en frames media + un mark de fin. */
  private sendAudio(audio: Buffer): void {
    const CHUNK = 4000; // ~500 ms par frame sortante, Twilio re-bufferise
    for (let i = 0; i < audio.length; i += CHUNK) {
      this.deps.send({
        event: "media",
        streamSid: this.streamSid,
        media: { payload: audio.subarray(i, i + CHUNK).toString("base64") },
      });
    }
    this.deps.send({
      event: "mark",
      streamSid: this.streamSid,
      mark: { name: `reply-${Date.now()}` },
    });
  }

  private resetTurn(): void {
    this.turnFrames = [];
    this.turnBytes = 0;
    this.speechFrames = 0;
    this.silenceStreak = 0;
  }
}
