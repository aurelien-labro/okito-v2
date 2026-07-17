import { describe, expect, it, vi } from "vitest";
import type { ChatService } from "../chat.js";
import { VoiceStreamSession, verifyVoiceStreamToken, voiceStreamToken } from "./stream-session.js";
import type { LiveSpeechToText, LiveTranscriberHandlers } from "./stt-live.js";
import type { StreamingTextToSpeech } from "./tts.js";

const SECRET = "secret-de-test-suffisamment-long";
const TENANT = "11111111-1111-1111-1111-111111111111";

/** STT live factice : expose les handlers pour simuler les events Deepgram. */
function makeFakeStt() {
  let handlers: LiveTranscriberHandlers | undefined;
  const sendAudio = vi.fn();
  const close = vi.fn();
  const stt: LiveSpeechToText = {
    connect(h) {
      handlers = h;
      return { sendAudio, close };
    },
  };
  return {
    stt,
    sendAudio,
    close,
    emit: (text: string, isFinal = true, speechFinal = true) =>
      handlers?.onTranscript({ text, isFinal, speechFinal }),
    utteranceEnd: () => handlers?.onUtteranceEnd(),
  };
}

/** TTS streamé factice : 3 chunks, avec un point d'attente contrôlable. */
function makeFakeTts(opts?: { gate?: Promise<void> }) {
  const synthesizeStream = vi.fn(async function* (_text: string, signal?: AbortSignal) {
    for (let i = 0; i < 3; i++) {
      if (opts?.gate) await opts.gate;
      if (signal?.aborted) return;
      yield Buffer.alloc(160, i + 1);
    }
  });
  const tts: StreamingTextToSpeech = { synthesizeStream };
  return { tts, synthesizeStream };
}

function makeSession(overrides?: {
  stt?: LiveSpeechToText;
  chat?: ChatService;
  tts?: StreamingTextToSpeech;
}) {
  const sent: Array<Record<string, unknown>> = [];
  const close = vi.fn();
  const fakeStt = makeFakeStt();
  const fakeTts = makeFakeTts();
  const chat: ChatService =
    overrides?.chat ??
    ({
      handle: vi.fn(async () => ({
        reply: "À quel nom ?",
        conversationId: "c1",
        status: "in_progress",
      })),
    } as unknown as ChatService);
  const session = new VoiceStreamSession({
    stt: overrides?.stt ?? fakeStt.stt,
    tts: overrides?.tts ?? fakeTts.tts,
    chat,
    secret: SECRET,
    send: (m) => sent.push(m),
    close,
  });
  return { session, sent, close, chat, fakeStt, fakeTts };
}

async function start(session: VoiceStreamSession, token = voiceStreamToken(SECRET, TENANT)) {
  await session.handleMessage({
    event: "start",
    streamSid: "MZ123",
    start: { callSid: "CA456", customParameters: { tenantId: TENANT, token } },
  });
}

const flush = () => new Promise((r) => setImmediate(r));

describe("voiceStreamToken", () => {
  it("vérifie le jeton HMAC, rejette un jeton forgé", () => {
    const token = voiceStreamToken(SECRET, TENANT);
    expect(verifyVoiceStreamToken(SECRET, TENANT, token)).toBe(true);
    expect(verifyVoiceStreamToken(SECRET, TENANT, "0".repeat(64))).toBe(false);
    expect(verifyVoiceStreamToken(SECRET, TENANT, "court")).toBe(false);
  });
});

describe("VoiceStreamSession (v3 live)", () => {
  it("start avec jeton invalide : connexion fermée, pas de connexion STT", async () => {
    const { session, close, fakeStt } = makeSession();
    await start(session, "jeton-forgé");
    expect(close).toHaveBeenCalled();
    await session.handleMessage({
      event: "media",
      media: { payload: Buffer.alloc(160, 1).toString("base64") },
    });
    expect(fakeStt.sendAudio).not.toHaveBeenCalled();
  });

  it("les frames media partent directement dans le STT live", async () => {
    const { session, fakeStt } = makeSession();
    await start(session);
    await session.handleMessage({
      event: "media",
      media: { payload: Buffer.alloc(160, 7).toString("base64") },
    });
    expect(fakeStt.sendAudio).toHaveBeenCalledTimes(1);
    expect(fakeStt.sendAudio.mock.calls[0]?.[0]).toEqual(Buffer.alloc(160, 7));
  });

  it("transcript speech_final : tour complet chat → TTS streamé → media + mark", async () => {
    const { session, sent, chat, fakeStt, fakeTts } = makeSession();
    await start(session);
    fakeStt.emit("une table pour deux");
    await flush();

    expect(chat.handle).toHaveBeenCalledWith({
      tenantId: TENANT,
      channel: "voice",
      sessionKey: "call-CA456",
      message: "une table pour deux",
    });
    expect(fakeTts.synthesizeStream).toHaveBeenCalledWith("À quel nom ?", expect.anything());
    const media = sent.filter((m) => m.event === "media");
    const marks = sent.filter((m) => m.event === "mark");
    expect(media).toHaveLength(3); // un message par chunk TTS
    expect(marks).toHaveLength(1);
    expect((media[0] as { streamSid: string }).streamSid).toBe("MZ123");
  });

  it("finals successifs sans speech_final : le tour part sur UtteranceEnd, texte concaténé", async () => {
    const { session, chat, fakeStt } = makeSession();
    await start(session);
    fakeStt.emit("une table", true, false);
    fakeStt.emit("pour deux", true, false);
    fakeStt.utteranceEnd();
    await flush();
    expect(chat.handle).toHaveBeenCalledTimes(1);
    const call = (chat.handle as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call.message).toBe("une table pour deux");
  });

  it("transcript vide : ni chat ni TTS", async () => {
    const { session, sent, chat, fakeStt } = makeSession();
    await start(session);
    fakeStt.emit("", true, true);
    fakeStt.utteranceEnd();
    await flush();
    expect(chat.handle).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("barge-in : parole pendant la réponse → clear envoyé et synthèse interrompue", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const gatedTts = makeFakeTts({ gate });
    const { session, sent, fakeStt } = makeSession({ tts: gatedTts.tts });
    await start(session);
    fakeStt.emit("une table pour deux");
    await flush(); // chat fini, TTS bloqué sur le premier chunk

    fakeStt.emit("attendez en fait", false, false); // interim pendant la réponse
    release();
    await flush();
    await flush();

    expect(sent.some((m) => m.event === "clear")).toBe(true);
    // La synthèse interrompue n'émet ni media ni mark après le clear.
    const clearIdx = sent.findIndex((m) => m.event === "clear");
    expect(sent.slice(clearIdx + 1).filter((m) => m.event === "media")).toHaveLength(0);
    expect(sent.filter((m) => m.event === "mark")).toHaveLength(0);
  });

  it("après le mark retour de Twilio, une nouvelle parole ne déclenche pas de clear", async () => {
    const { session, sent, fakeStt } = makeSession();
    await start(session);
    fakeStt.emit("une table pour deux");
    await flush();
    await session.handleMessage({ event: "mark" }); // lecture terminée côté Twilio
    fakeStt.emit("et une chaise haute", true, true);
    await flush();
    expect(sent.filter((m) => m.event === "clear")).toHaveLength(0);
  });

  it("deux tours réutilisent la même sessionKey (mémoire de conversation)", async () => {
    const { session, chat, fakeStt } = makeSession();
    await start(session);
    fakeStt.emit("une table pour deux");
    await flush();
    await session.handleMessage({ event: "mark" });
    fakeStt.emit("vers vingt heures");
    await flush();
    const calls = (chat.handle as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0].sessionKey).toBe(calls[1]?.[0].sessionKey);
  });

  it("stop : le socket STT est fermé", async () => {
    const { session, fakeStt } = makeSession();
    await start(session);
    await session.handleMessage({ event: "stop" });
    expect(fakeStt.close).toHaveBeenCalled();
  });
});
