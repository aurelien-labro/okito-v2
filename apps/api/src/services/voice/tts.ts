import { logger } from "../../lib/logger.js";

/**
 * Text-to-speech du pipeline voix maison (vague 4).
 * v1 non-streaming : un texte → un audio complet (mp3). Le streaming par
 * chunks arrivera avec Twilio Media Streams en v2. Le voice cloning (digital
 * twin du patron) se branchera ici via un voiceId par tenant.
 */
export interface TextToSpeech {
  synthesize(text: string): Promise<{ audio: Buffer; mime: string }>;
}

/** Voix multilingue par défaut d'ElevenLabs ("George") — remplaçable par env. */
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

export class ElevenLabsTTS implements TextToSpeech {
  constructor(
    private readonly apiKey: string,
    private readonly voiceId: string = DEFAULT_VOICE_ID,
    private readonly fetchImpl: typeof fetch = fetch,
    /** "ulaw_8000" pour le flux téléphone Twilio ; défaut mp3. */
    private readonly outputFormat?: string,
  ) {}

  async synthesize(text: string): Promise<{ audio: Buffer; mime: string }> {
    const query = this.outputFormat ? `?output_format=${this.outputFormat}` : "";
    const res = await this.fetchImpl(`${ELEVENLABS_URL}/${this.voiceId}${query}`, {
      method: "POST",
      headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "ElevenLabs: synthèse échouée");
      throw new Error(`ElevenLabs HTTP ${res.status}`);
    }
    const mime = this.outputFormat?.startsWith("ulaw") ? "audio/basic" : "audio/mpeg";
    return { audio: Buffer.from(await res.arrayBuffer()), mime };
  }
}
