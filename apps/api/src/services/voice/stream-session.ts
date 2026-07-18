import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "../../lib/logger.js";
import type { ChatService } from "../chat.js";
import type { LiveSpeechToText, LiveTranscriber } from "./stt-live.js";
import type { StreamingTextToSpeech } from "./tts.js";

/**
 * Session Twilio Media Streams (pipeline voix v3, vague 4).
 *
 * v3 full-streaming : chaque frame μ-law part immédiatement dans Deepgram
 * live (word-by-word), la fin de tour vient de l'endpointing serveur
 * (speech_final / UtteranceEnd), et la réponse est synthétisée en streaming
 * ElevenLabs — les chunks partent vers Twilio dès leur arrivée.
 *
 * Barge-in : si le client reparle pendant que l'assistant joue sa réponse,
 * on envoie l'event "clear" à Twilio (vide son buffer de lecture) et on
 * abandonne la synthèse en cours via AbortController + compteur de
 * génération (une réponse périmée arrivée après coup est jetée).
 */

/** Garde-fou : un tour utilisateur ne dépasse pas ~2000 caractères de transcript. */
const MAX_TURN_CHARS = 2000;

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
  stt: LiveSpeechToText;
  tts: StreamingTextToSpeech;
  chat: ChatService;
  secret: string;
  /**
   * Voice cloning : TTS spécifique au tenant (voix clonée du patron).
   * Résolu une fois par appel ; en absence ou en erreur → tts par défaut.
   */
  resolveTts?: (tenantId: string) => Promise<StreamingTextToSpeech | undefined>;
  /** Envoie un message JSON à Twilio (frame media, mark, clear…). */
  send: (message: Record<string, unknown>) => void;
  /** Ferme la connexion (auth invalide, erreur fatale). */
  close: () => void;
  /** Observabilité : appel accepté (token vérifié). */
  onCallStart?: (callSid: string, tenantId: string) => void;
  /** Observabilité : latences d'un tour terminé ou interrompu. */
  onTurn?: (
    callSid: string,
    metrics: { llmMs: number; ttsFirstChunkMs: number; totalMs: number; interrupted: boolean },
  ) => void;
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
  private transcriber?: LiveTranscriber;
  /** Finals accumulés du tour en cours (Deepgram peut découper en segments). */
  private pendingText = "";
  /** L'assistant est en train de répondre (synthèse ou lecture côté Twilio). */
  private replying = false;
  /** Invalide les réponses périmées après un barge-in. */
  private generation = 0;
  private abort?: AbortController;
  /** TTS de l'appel (voix clonée du tenant si dispo), résolu au premier tour. */
  private ttsForCall?: StreamingTextToSpeech;
  private callSid = "";

  constructor(private readonly deps: StreamSessionDeps) {}

  /** Un message WebSocket Twilio (JSON déjà parsé). */
  async handleMessage(raw: unknown): Promise<void> {
    const msg = raw as TwilioMessage;
    switch (msg.event) {
      case "start":
        return this.handleStart(msg);
      case "media":
        return this.handleMedia(msg);
      case "mark":
        // Twilio renvoie le mark quand la LECTURE l'atteint : la réponse est
        // finie côté client, plus besoin de barge-in.
        this.replying = false;
        return;
      case "stop":
        logger.info({ streamSid: this.streamSid, tenantId: this.tenantId }, "voice: stream stop");
        this.transcriber?.close();
        this.abort?.abort();
        return;
      default:
        return; // connected, dtmf… ignorés
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
    this.callSid = msg.start?.callSid ?? this.streamSid;
    this.sessionKey = `call-${this.callSid}`;
    this.deps.onCallStart?.(this.callSid, tenantId);
    this.transcriber = this.deps.stt.connect({
      onTranscript: (evt) => this.onTranscript(evt.text, evt.isFinal, evt.speechFinal),
      onUtteranceEnd: () => this.endTurn(),
      onError: (err) => logger.error({ err, streamSid: this.streamSid }, "voice: erreur STT live"),
    });
    logger.info({ streamSid: this.streamSid, tenantId }, "voice: stream start (v3 live)");
  }

  private handleMedia(msg: TwilioMessage): void {
    if (!this.transcriber || !msg.media?.payload) return;
    this.transcriber.sendAudio(Buffer.from(msg.media.payload, "base64"));
  }

  private onTranscript(text: string, isFinal: boolean, speechFinal: boolean): void {
    // Barge-in : le client parle pendant la réponse → couper la lecture Twilio
    // et abandonner la synthèse en cours.
    if (text && this.replying) {
      this.replying = false;
      this.generation++;
      this.abort?.abort();
      this.deps.send({ event: "clear", streamSid: this.streamSid });
      logger.info({ streamSid: this.streamSid }, "voice: barge-in — réponse interrompue");
    }
    if (isFinal && text && this.pendingText.length < MAX_TURN_CHARS) {
      this.pendingText = this.pendingText ? `${this.pendingText} ${text}` : text;
    }
    if (speechFinal) this.endTurn();
  }

  private endTurn(): void {
    const text = this.pendingText.trim();
    this.pendingText = "";
    if (!text) return;
    void this.reply(text);
  }

  private async reply(text: string): Promise<void> {
    const gen = ++this.generation;
    this.replying = true;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    // Latences du tour, chrono depuis la fin de parole du client (endTurn).
    const turnStartedAt = Date.now();
    let llmMs = 0;
    let ttsFirstChunkMs = 0;
    const emitMetrics = (interrupted: boolean) =>
      this.deps.onTurn?.(this.callSid, {
        llmMs,
        ttsFirstChunkMs,
        totalMs: Date.now() - turnStartedAt,
        interrupted,
      });
    try {
      const response = await this.deps.chat.handle({
        tenantId: this.tenantId,
        channel: "voice",
        sessionKey: this.sessionKey,
        message: text,
      });
      llmMs = Date.now() - turnStartedAt;
      if (gen !== this.generation) return emitMetrics(true); // barge-in pendant le LLM
      const tts = await this.tts();
      if (gen !== this.generation) return emitMetrics(true);
      const ttsStartedAt = Date.now();
      for await (const chunk of tts.synthesizeStream(response.reply, signal)) {
        if (ttsFirstChunkMs === 0) ttsFirstChunkMs = Date.now() - ttsStartedAt;
        if (gen !== this.generation) return emitMetrics(true);
        this.deps.send({
          event: "media",
          streamSid: this.streamSid,
          media: { payload: chunk.toString("base64") },
        });
      }
      if (gen !== this.generation) return emitMetrics(true);
      this.deps.send({
        event: "mark",
        streamSid: this.streamSid,
        mark: { name: `reply-${gen}` },
      });
      emitMetrics(false);
    } catch (err) {
      if (!signal.aborted) {
        logger.error({ err, streamSid: this.streamSid }, "voice: tour échoué");
      }
      if (gen === this.generation) this.replying = false;
    }
    // Pas de reset de `replying` en succès : Twilio joue encore l'audio
    // bufferisé ; c'est son event "mark" retour qui clôt la réponse.
  }

  private async tts(): Promise<StreamingTextToSpeech> {
    if (!this.ttsForCall) {
      try {
        this.ttsForCall = (await this.deps.resolveTts?.(this.tenantId)) ?? this.deps.tts;
      } catch (err) {
        logger.warn({ err, tenantId: this.tenantId }, "voice: résolution TTS tenant échouée");
        this.ttsForCall = this.deps.tts;
      }
    }
    return this.ttsForCall;
  }
}
