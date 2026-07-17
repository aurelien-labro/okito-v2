/**
 * Banc de latence réel du pipeline v3 (hors tronçon téléphonique Twilio) :
 *
 * 1. Génère un "appelant" : phrase FR synthétisée en μ-law 8 kHz (ElevenLabs).
 * 2. Stream les frames de 160 octets (cadence réelle 20 ms) vers Deepgram
 *    live WS et mesure : dernier octet envoyé → speech_final (fin de tour).
 * 3. Mesure ElevenLabs /stream : requête → premier chunk audio.
 *
 * Latence bot ≈ (2) + LLM + (3). L'objectif < 800 ms porte sur (2) + (3).
 * Usage : pnpm --filter @okito/api exec tsx scripts/voice-v3-bench.ts
 */
import "dotenv/config";
import { DeepgramLiveSTT } from "../src/services/voice/stt-live.js";
import { ElevenLabsTTS } from "../src/services/voice/tts.js";

const dg = process.env.DEEPGRAM_API_KEY;
const el = process.env.ELEVENLABS_API_KEY;
if (!dg || !el) throw new Error("DEEPGRAM_API_KEY / ELEVENLABS_API_KEY manquantes");

const phrase = "Bonjour, je voudrais réserver une table pour deux personnes ce soir.";
const tts = new ElevenLabsTTS(el, process.env.ELEVENLABS_VOICE_ID, fetch, "ulaw_8000");

console.log("1/3 — synthèse de l'appelant (μ-law 8 kHz)…");
const { audio } = await tts.synthesize(phrase);
console.log(`    ${audio.length} octets (${(audio.length / 8000).toFixed(1)} s d'audio)`);

console.log("2/3 — stream vers Deepgram live (cadence réelle 20 ms/frame)…");
const stt = new DeepgramLiveSTT(dg);
let lastByteSentAt = 0;
let firstInterimAt = 0;
let done!: (v: { text: string; finalAt: number }) => void;
const finished = new Promise<{ text: string; finalAt: number }>((resolve) => {
  done = resolve;
});
const finals: string[] = [];
const transcriber = stt.connect({
  onTranscript(evt) {
    if (evt.text && !firstInterimAt) firstInterimAt = Date.now();
    if (evt.isFinal && evt.text) finals.push(evt.text);
    if (evt.speechFinal) done({ text: finals.join(" "), finalAt: Date.now() });
  },
  onUtteranceEnd() {
    done({ text: finals.join(" "), finalAt: Date.now() });
  },
  onError(err) {
    console.error("STT error", err);
  },
});

const FRAME = 160; // 20 ms de μ-law 8 kHz
for (let i = 0; i < audio.length; i += FRAME) {
  transcriber.sendAudio(audio.subarray(i, i + FRAME));
  await new Promise((r) => setTimeout(r, 20));
}
lastByteSentAt = Date.now();
// Silence de fin pour déclencher l'endpointing (1,5 s).
const silence = Buffer.alloc(FRAME, 0xff);
const silenceTimer = setInterval(() => transcriber.sendAudio(silence), 20);
const { text, finalAt } = await finished;
clearInterval(silenceTimer);
transcriber.close();
console.log(`    transcript : ${text}`);
console.log(
  `    premier interim : ${firstInterimAt - lastByteSentAt} ms avant/après fin de parole`,
);
console.log(`    fin de parole → speech_final : ${finalAt - lastByteSentAt} ms`);

console.log("3/3 — ElevenLabs /stream (flash v2.5) : premier chunk…");
const t0 = Date.now();
let firstChunkMs = 0;
let total = 0;
for await (const chunk of tts.synthesizeStream(
  "Bien sûr, à quel nom dois-je noter la réservation ?",
)) {
  if (!firstChunkMs) firstChunkMs = Date.now() - t0;
  total += chunk.length;
}
console.log(
  `    premier chunk : ${firstChunkMs} ms — total ${total} octets en ${Date.now() - t0} ms`,
);

const endpointing = finalAt - lastByteSentAt;
console.log(
  `\nLatence pipeline (hors LLM + réseau téléphone) ≈ ${endpointing + firstChunkMs} ms ` +
    `(endpointing ${endpointing} + TTS premier chunk ${firstChunkMs}) — objectif < 800 ms`,
);
process.exit(0);
