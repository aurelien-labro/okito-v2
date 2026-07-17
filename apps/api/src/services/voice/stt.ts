import { logger } from "../../lib/logger.js";

/**
 * Speech-to-text du pipeline voix maison (vague 4).
 * v1 non-streaming : un enregistrement complet → un transcript. Le streaming
 * temps réel (Twilio Media Streams) branchera la même interface en v2.
 */
export interface SpeechToText {
  transcribe(audio: Buffer, mime: string): Promise<{ text: string; language?: string }>;
}

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

/**
 * Deepgram (nova-2, détection de langue) en REST brut, même pattern que les
 * autres intégrations : fetch injectable pour les tests, erreurs HTTP explicites.
 */
export class DeepgramSTT implements SpeechToText {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async transcribe(audio: Buffer, mime: string): Promise<{ text: string; language?: string }> {
    const res = await this.fetchImpl(
      `${DEEPGRAM_URL}?model=nova-2&smart_format=true&detect_language=true`,
      {
        method: "POST",
        headers: { Authorization: `Token ${this.apiKey}`, "Content-Type": mime },
        body: new Uint8Array(audio),
      },
    );
    if (!res.ok) {
      logger.error({ status: res.status }, "Deepgram: transcription échouée");
      throw new Error(`Deepgram HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      results?: {
        channels?: Array<{
          detected_language?: string;
          alternatives?: Array<{ transcript?: string }>;
        }>;
      };
    };
    const channel = json.results?.channels?.[0];
    return {
      text: channel?.alternatives?.[0]?.transcript?.trim() ?? "",
      language: channel?.detected_language,
    };
  }
}
