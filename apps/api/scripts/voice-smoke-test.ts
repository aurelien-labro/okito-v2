/**
 * Smoke test réel du pipeline voix (hors ChatService) : ElevenLabs TTS →
 * Deepgram STT sur le mp3 produit. Valide les deux clés et la chaîne audio.
 * Usage : pnpm --filter @okito/api exec tsx scripts/voice-smoke-test.ts
 */
import "dotenv/config";
import { DeepgramSTT } from "../src/services/voice/stt.js";
import { ElevenLabsTTS } from "../src/services/voice/tts.js";

const dg = process.env.DEEPGRAM_API_KEY;
const el = process.env.ELEVENLABS_API_KEY;
if (!dg || !el) throw new Error("DEEPGRAM_API_KEY / ELEVENLABS_API_KEY manquantes");

const phrase = "Bonjour, je voudrais réserver une table pour deux personnes ce soir.";
const t0 = Date.now();
const { audio, mime } = await new ElevenLabsTTS(el, process.env.ELEVENLABS_VOICE_ID).synthesize(
  phrase,
);
const tTts = Date.now();
console.log(`TTS OK : ${audio.length} octets (${mime}) en ${tTts - t0} ms`);

const result = await new DeepgramSTT(dg).transcribe(audio, mime);
console.log(`STT OK en ${Date.now() - tTts} ms — langue: ${result.language}`);
console.log(`Phrase envoyée : ${phrase}`);
console.log(`Transcript     : ${result.text}`);
process.exit(0);
