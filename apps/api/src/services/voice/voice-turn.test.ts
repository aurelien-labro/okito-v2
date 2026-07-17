import { describe, expect, it, vi } from "vitest";
import type { ChatService } from "../chat.js";
import { DeepgramSTT } from "./stt.js";
import type { SpeechToText } from "./stt.js";
import { ElevenLabsTTS } from "./tts.js";
import type { TextToSpeech } from "./tts.js";
import { VoiceTurnService } from "./voice-turn.js";

function fakeChat(reply: string): ChatService {
  return {
    handle: vi.fn(async () => ({ reply, conversationId: "conv-1", status: "in_progress" })),
  } as unknown as ChatService;
}

describe("VoiceTurnService", () => {
  it("enchaîne STT → chat (channel voice) → TTS", async () => {
    const stt: SpeechToText = {
      transcribe: vi.fn(async () => ({ text: "une table pour deux ce soir" })),
    };
    const tts: TextToSpeech = {
      synthesize: vi.fn(async () => ({ audio: Buffer.from("mp3"), mime: "audio/mpeg" })),
    };
    const chat = fakeChat("À quel nom ?");
    const svc = new VoiceTurnService(stt, tts, chat);

    const result = await svc.handle({
      tenantId: "11111111-1111-1111-1111-111111111111",
      sessionKey: "call-42",
      audio: Buffer.from("audio"),
      mime: "audio/webm",
    });

    expect(chat.handle).toHaveBeenCalledWith({
      tenantId: "11111111-1111-1111-1111-111111111111",
      channel: "voice",
      sessionKey: "call-42",
      message: "une table pour deux ce soir",
    });
    expect(tts.synthesize).toHaveBeenCalledWith("À quel nom ?");
    expect(result).toMatchObject({
      transcript: "une table pour deux ce soir",
      reply: "À quel nom ?",
      mime: "audio/mpeg",
    });
  });

  it("transcript vide : 400 explicite, ni chat ni TTS appelés", async () => {
    const stt: SpeechToText = { transcribe: vi.fn(async () => ({ text: "" })) };
    const tts: TextToSpeech = { synthesize: vi.fn() };
    const chat = fakeChat("jamais");
    const svc = new VoiceTurnService(stt, tts, chat);

    await expect(
      svc.handle({
        tenantId: "11111111-1111-1111-1111-111111111111",
        sessionKey: "call-43",
        audio: Buffer.from("silence"),
        mime: "audio/webm",
      }),
    ).rejects.toThrow("Aucune parole détectée");
    expect(chat.handle).not.toHaveBeenCalled();
    expect(tts.synthesize).not.toHaveBeenCalled();
  });
});

describe("DeepgramSTT", () => {
  it("parse le transcript et la langue détectée", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: {
              channels: [
                {
                  detected_language: "fr",
                  alternatives: [{ transcript: " Bonjour, une table. " }],
                },
              ],
            },
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
    const stt = new DeepgramSTT("dg-key", fetchImpl);

    const result = await stt.transcribe(Buffer.from("audio"), "audio/webm");

    expect(result).toEqual({ text: "Bonjour, une table.", language: "fr" });
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("api.deepgram.com");
    expect((init.headers as Record<string, string>).Authorization).toBe("Token dg-key");
  });

  it("HTTP non-2xx : erreur explicite", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("nope", { status: 401 }),
    ) as unknown as typeof fetch;
    const stt = new DeepgramSTT("bad-key", fetchImpl);
    await expect(stt.transcribe(Buffer.from("x"), "audio/webm")).rejects.toThrow(
      "Deepgram HTTP 401",
    );
  });
});

describe("ElevenLabsTTS", () => {
  it("renvoie l'audio mp3 et passe la clé + le voiceId", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(Buffer.from("mp3-bytes"), { status: 200 }),
    ) as unknown as typeof fetch;
    const tts = new ElevenLabsTTS("el-key", "voice-123", fetchImpl);

    const result = await tts.synthesize("Bonjour !");

    expect(result.mime).toBe("audio/mpeg");
    expect(result.audio.toString()).toBe("mp3-bytes");
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/text-to-speech/voice-123");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("el-key");
  });

  it("HTTP non-2xx : erreur explicite", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("quota", { status: 429 }),
    ) as unknown as typeof fetch;
    const tts = new ElevenLabsTTS("el-key", undefined, fetchImpl);
    await expect(tts.synthesize("texte")).rejects.toThrow("ElevenLabs HTTP 429");
  });
});
