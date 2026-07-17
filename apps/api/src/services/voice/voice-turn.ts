import { BadRequestError } from "../../lib/errors.js";
import type { ChatService } from "../chat.js";
import type { SpeechToText } from "./stt.js";
import type { TextToSpeech } from "./tts.js";

export interface VoiceTurnResult {
  transcript: string;
  reply: string;
  conversationId: string;
  status: string;
  audio: Buffer;
  mime: string;
}

/**
 * Un tour de conversation vocale complet : audio client → STT → orchestrateur
 * (le même ChatService que WhatsApp/web, channel "voice" — mémoire de session
 * par sessionKey) → TTS → audio de réponse.
 *
 * v1 non-streaming du pipeline voix maison (vague 4) : prouve la chaîne de
 * bout en bout et sert de banc de latence. Le temps réel (Twilio Media
 * Streams, WebSocket) réutilisera STT/TTS/ChatService tels quels en v2.
 * Vapi reste le canal téléphone en prod tant que ce pipeline n'est pas au niveau.
 */
export class VoiceTurnService {
  constructor(
    private readonly stt: SpeechToText,
    private readonly tts: TextToSpeech,
    private readonly chat: ChatService,
  ) {}

  async handle(input: {
    tenantId: string;
    sessionKey: string;
    audio: Buffer;
    mime: string;
  }): Promise<VoiceTurnResult> {
    const { text: transcript } = await this.stt.transcribe(input.audio, input.mime);
    if (!transcript) {
      throw new BadRequestError("Aucune parole détectée dans l'audio", "empty_transcript");
    }

    const response = await this.chat.handle({
      tenantId: input.tenantId,
      channel: "voice",
      sessionKey: input.sessionKey,
      message: transcript,
    });

    const { audio, mime } = await this.tts.synthesize(response.reply);
    return {
      transcript,
      reply: response.reply,
      conversationId: response.conversationId,
      status: response.status,
      audio,
      mime,
    };
  }
}
