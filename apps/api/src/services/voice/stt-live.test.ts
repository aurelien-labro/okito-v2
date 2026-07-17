import { describe, expect, it, vi } from "vitest";
import { DeepgramLiveSTT, type MinimalWebSocket } from "./stt-live.js";

type Listener = (evt: { data?: unknown }) => void;

function makeFakeWs() {
  const listeners = new Map<string, Listener[]>();
  const sent: Array<string | Uint8Array> = [];
  const ws: MinimalWebSocket & { emit: (type: string, evt?: { data?: unknown }) => void } = {
    readyState: 0,
    send: (data) => sent.push(data as string | Uint8Array),
    close: vi.fn(),
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    emit(type, evt = {}) {
      for (const l of listeners.get(type) ?? []) l(evt);
    },
  };
  return { ws, sent };
}

function connect() {
  const { ws, sent } = makeFakeWs();
  let capturedUrl = "";
  let capturedProtocols: string[] = [];
  const stt = new DeepgramLiveSTT("dg-key", undefined, (url, protocols) => {
    capturedUrl = url;
    capturedProtocols = protocols;
    return ws;
  });
  const handlers = {
    onTranscript: vi.fn(),
    onUtteranceEnd: vi.fn(),
    onError: vi.fn(),
  };
  const transcriber = stt.connect(handlers);
  return {
    ws,
    sent,
    handlers,
    transcriber,
    url: () => capturedUrl,
    protocols: () => capturedProtocols,
  };
}

describe("DeepgramLiveSTT", () => {
  it("ouvre le socket avec l'auth par sous-protocole et le flux μ-law 8 kHz", () => {
    const c = connect();
    expect(c.protocols()).toEqual(["token", "dg-key"]);
    expect(c.url()).toContain("encoding=mulaw");
    expect(c.url()).toContain("sample_rate=8000");
    expect(c.url()).toContain("interim_results=true");
  });

  it("bufferise l'audio avant l'ouverture, flush à l'open", () => {
    const c = connect();
    c.transcriber.sendAudio(Buffer.alloc(160, 1));
    expect(c.sent).toHaveLength(0);
    c.ws.readyState = 1;
    c.ws.emit("open");
    expect(c.sent).toHaveLength(1);
    c.transcriber.sendAudio(Buffer.alloc(160, 2));
    expect(c.sent).toHaveLength(2);
  });

  it("relaie Results (transcript, is_final, speech_final) et UtteranceEnd", () => {
    const c = connect();
    c.ws.emit("message", {
      data: JSON.stringify({
        type: "Results",
        is_final: true,
        speech_final: true,
        channel: { alternatives: [{ transcript: " bonjour " }] },
      }),
    });
    expect(c.handlers.onTranscript).toHaveBeenCalledWith({
      text: "bonjour",
      isFinal: true,
      speechFinal: true,
    });
    c.ws.emit("message", { data: JSON.stringify({ type: "UtteranceEnd" }) });
    expect(c.handlers.onUtteranceEnd).toHaveBeenCalled();
  });

  it("close : envoie CloseStream puis ferme, et l'audio suivant est ignoré", () => {
    const c = connect();
    c.ws.readyState = 1;
    c.ws.emit("open");
    c.transcriber.close();
    expect(c.sent).toContain(JSON.stringify({ type: "CloseStream" }));
    expect(c.ws.close).toHaveBeenCalled();
    c.transcriber.sendAudio(Buffer.alloc(160, 1));
    expect(c.sent.filter((s) => typeof s !== "string")).toHaveLength(0);
  });

  it("message non-JSON : onError, pas de crash", () => {
    const c = connect();
    c.ws.emit("message", { data: "pas du json" });
    expect(c.handlers.onError).toHaveBeenCalled();
  });
});
