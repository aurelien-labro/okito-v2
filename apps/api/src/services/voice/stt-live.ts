import { logger } from "../../lib/logger.js";

/**
 * Speech-to-text temps réel du pipeline voix (v3, vague 4).
 *
 * Contrairement au SpeechToText v1/v2 (un buffer complet → un transcript),
 * le mode live pousse chaque frame audio dès réception et reçoit les
 * transcripts word-by-word (interims + finals). La fin de tour est détectée
 * côté serveur STT (endpointing + UtteranceEnd), plus de seuil d'énergie local.
 */

export interface LiveTranscriptEvent {
  text: string;
  /** Segment figé (ne sera plus révisé). */
  isFinal: boolean;
  /** Fin de prise de parole détectée par l'endpointing serveur. */
  speechFinal: boolean;
}

export interface LiveTranscriberHandlers {
  onTranscript(evt: LiveTranscriptEvent): void;
  /** Filet de sécurité : silence prolongé après des finals sans speech_final. */
  onUtteranceEnd(): void;
  onError(err: unknown): void;
}

export interface LiveTranscriber {
  sendAudio(frame: Buffer): void;
  close(): void;
}

export interface LiveSpeechToText {
  connect(handlers: LiveTranscriberHandlers): LiveTranscriber;
}

/** Sous-ensemble du WebSocket global (Node ≥ 21) utilisé ici — injectable en test. */
export interface MinimalWebSocket {
  readyState: number;
  send(data: string | ArrayBufferLike | Uint8Array): void;
  close(): void;
  addEventListener(type: string, listener: (evt: { data?: unknown }) => void): void;
}

const DEEPGRAM_LIVE_URL = "wss://api.deepgram.com/v1/listen";
/** nova-3 + language=multi : seul combo Deepgram supportant le streaming multilingue. */
const DEFAULT_QUERY =
  "model=nova-3&language=multi&encoding=mulaw&sample_rate=8000&channels=1" +
  "&interim_results=true&punctuate=true&endpointing=300&utterance_end_ms=1000";
const WS_OPEN = 1;

interface DeepgramLiveMessage {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: Array<{ transcript?: string }> };
}

/**
 * Client Deepgram live sur le WebSocket natif de Node (auth par sous-protocole
 * "token"). Les frames reçues avant l'ouverture du socket sont bufferisées.
 */
export class DeepgramLiveSTT implements LiveSpeechToText {
  constructor(
    private readonly apiKey: string,
    private readonly query = DEFAULT_QUERY,
    private readonly wsFactory: (url: string, protocols: string[]) => MinimalWebSocket = (
      url,
      protocols,
    ) => new WebSocket(url, protocols) as unknown as MinimalWebSocket,
  ) {}

  connect(handlers: LiveTranscriberHandlers): LiveTranscriber {
    const ws = this.wsFactory(`${DEEPGRAM_LIVE_URL}?${this.query}`, ["token", this.apiKey]);
    const pending: Buffer[] = [];
    let open = false;
    let closed = false;

    ws.addEventListener("open", () => {
      open = true;
      for (const frame of pending) ws.send(new Uint8Array(frame));
      pending.length = 0;
    });
    ws.addEventListener("message", (evt) => {
      try {
        const msg = JSON.parse(String(evt.data)) as DeepgramLiveMessage;
        if (msg.type === "Results") {
          handlers.onTranscript({
            text: msg.channel?.alternatives?.[0]?.transcript?.trim() ?? "",
            isFinal: msg.is_final === true,
            speechFinal: msg.speech_final === true,
          });
        } else if (msg.type === "UtteranceEnd") {
          handlers.onUtteranceEnd();
        }
      } catch (err) {
        handlers.onError(err);
      }
    });
    ws.addEventListener("error", (evt) => {
      if (!closed) handlers.onError(evt);
    });
    ws.addEventListener("close", () => {
      if (!closed) logger.warn("Deepgram live: socket fermé côté serveur");
    });

    return {
      sendAudio(frame: Buffer): void {
        if (closed) return;
        if (open && ws.readyState === WS_OPEN) ws.send(new Uint8Array(frame));
        else pending.push(frame);
      },
      close(): void {
        closed = true;
        try {
          if (ws.readyState === WS_OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
          ws.close();
        } catch {
          // socket déjà fermé
        }
      },
    };
  }
}
