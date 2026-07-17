import { describe, expect, it, vi } from "vitest";
import type { ChatService } from "../chat.js";
import { VoiceStreamSession, verifyVoiceStreamToken, voiceStreamToken } from "./stream-session.js";
import type { SpeechToText } from "./stt.js";
import type { TextToSpeech } from "./tts.js";

const SECRET = "secret-de-test-suffisamment-long";
const TENANT = "11111111-1111-1111-1111-111111111111";

/** Frame μ-law "parole" (0x00 décode vers une forte amplitude). */
const SPEECH_FRAME = Buffer.alloc(160, 0x00).toString("base64");
/** Frame μ-law "silence" (0xff décode vers ~0). */
const SILENCE_FRAME = Buffer.alloc(160, 0xff).toString("base64");

function makeSession(overrides?: {
  stt?: SpeechToText;
  chat?: ChatService;
  tts?: TextToSpeech;
}) {
  const sent: Array<Record<string, unknown>> = [];
  const close = vi.fn();
  const stt: SpeechToText = overrides?.stt ?? {
    transcribe: vi.fn(async () => ({ text: "une table pour deux" })),
  };
  const tts: TextToSpeech =
    overrides?.tts ??
    ({
      synthesize: vi.fn(async () => ({ audio: Buffer.alloc(9000, 1), mime: "audio/basic" })),
    } as TextToSpeech);
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
    stt,
    tts,
    chat,
    secret: SECRET,
    send: (m) => sent.push(m),
    close,
  });
  return { session, sent, close, stt, tts, chat };
}

async function start(session: VoiceStreamSession, token = voiceStreamToken(SECRET, TENANT)) {
  await session.handleMessage({
    event: "start",
    streamSid: "MZ123",
    start: { callSid: "CA456", customParameters: { tenantId: TENANT, token } },
  });
}

async function feed(session: VoiceStreamSession, payload: string, count: number) {
  for (let i = 0; i < count; i++) {
    await session.handleMessage({ event: "media", media: { payload } });
  }
}

describe("voiceStreamToken", () => {
  it("vérifie le jeton HMAC, rejette un jeton forgé", () => {
    const token = voiceStreamToken(SECRET, TENANT);
    expect(verifyVoiceStreamToken(SECRET, TENANT, token)).toBe(true);
    expect(verifyVoiceStreamToken(SECRET, TENANT, "0".repeat(64))).toBe(false);
    expect(verifyVoiceStreamToken(SECRET, TENANT, "court")).toBe(false);
  });
});

describe("VoiceStreamSession", () => {
  it("start avec jeton invalide : connexion fermée, media ignorées", async () => {
    const { session, close, stt } = makeSession();
    await start(session, "jeton-forgé");
    expect(close).toHaveBeenCalled();
    await feed(session, SPEECH_FRAME, 20);
    await feed(session, SILENCE_FRAME, 50);
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it("parole puis 800 ms de silence : tour complet STT → chat → TTS → frames media + mark", async () => {
    const { session, sent, stt, chat, tts } = makeSession();
    await start(session);
    await feed(session, SPEECH_FRAME, 20); // ~400 ms de parole
    await feed(session, SILENCE_FRAME, 40); // ~800 ms de silence → fin de tour

    expect(stt.transcribe).toHaveBeenCalledTimes(1);
    expect(chat.handle).toHaveBeenCalledWith({
      tenantId: TENANT,
      channel: "voice",
      sessionKey: "call-CA456",
      message: "une table pour deux",
    });
    expect(tts.synthesize).toHaveBeenCalledWith("À quel nom ?");
    const media = sent.filter((m) => m.event === "media");
    const marks = sent.filter((m) => m.event === "mark");
    expect(media.length).toBeGreaterThanOrEqual(2); // 9000 octets, chunks de 4000
    expect(marks).toHaveLength(1);
    expect((media[0] as { streamSid: string }).streamSid).toBe("MZ123");
  });

  it("silence seul (pas assez de parole) : aucun tour déclenché", async () => {
    const { session, stt } = makeSession();
    await start(session);
    await feed(session, SILENCE_FRAME, 100);
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it("transcript vide : ni chat ni TTS, la session continue", async () => {
    const stt: SpeechToText = { transcribe: vi.fn(async () => ({ text: "" })) };
    const { session, sent, chat, tts } = makeSession({ stt });
    await start(session);
    await feed(session, SPEECH_FRAME, 20);
    await feed(session, SILENCE_FRAME, 40);
    expect(chat.handle).not.toHaveBeenCalled();
    expect(tts.synthesize).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("un second tour réutilise la même sessionKey (mémoire de conversation)", async () => {
    const { session, chat } = makeSession();
    await start(session);
    await feed(session, SPEECH_FRAME, 20);
    await feed(session, SILENCE_FRAME, 40);
    await feed(session, SPEECH_FRAME, 20);
    await feed(session, SILENCE_FRAME, 40);
    expect(chat.handle).toHaveBeenCalledTimes(2);
    const calls = (chat.handle as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]?.[0].sessionKey).toBe(calls[1]?.[0].sessionKey);
  });
});
