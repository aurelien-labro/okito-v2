import { describe, expect, it, vi } from "vitest";
import { VoiceOpsService } from "./voice-ops.js";
import type { VoiceProfileService } from "./voice-profile.js";

function makeFetch(responses: Record<string, { status: number }>) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const s = String(url);
    for (const [needle, { status }] of Object.entries(responses)) {
      if (s.includes(needle)) return new Response("{}", { status });
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
}

const TENANT = "2853f3bc-cc57-46c1-959e-a07354feb505";

describe("VoiceOpsService", () => {
  it("health : tout vert quand les deux providers répondent et le stream est configuré", async () => {
    const fetchImpl = makeFetch({ deepgram: { status: 200 }, elevenlabs: { status: 200 } });
    const svc = new VoiceOpsService("dg-key", "el-key", true, undefined, fetchImpl);
    const health = await svc.health(TENANT);
    expect(health.ready).toBe(true);
    expect(health.deepgram.ok).toBe(true);
    expect(health.elevenlabs.ok).toBe(true);
    expect(health.deepgram.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.streamConfigured).toBe(true);
    expect(health.cloneActive).toBe(false);
  });

  it("health : clé ElevenLabs morte → pas prêt, erreur remontée", async () => {
    const fetchImpl = makeFetch({ deepgram: { status: 200 }, elevenlabs: { status: 401 } });
    const svc = new VoiceOpsService("dg-key", "el-key", true, undefined, fetchImpl);
    const health = await svc.health(TENANT);
    expect(health.ready).toBe(false);
    expect(health.elevenlabs.ok).toBe(false);
    expect(health.elevenlabs.error).toBe("HTTP 401");
  });

  it("health : stream non configuré → pas prêt même avec providers verts", async () => {
    const fetchImpl = makeFetch({});
    const svc = new VoiceOpsService("dg-key", "el-key", false, undefined, fetchImpl);
    const health = await svc.health(TENANT);
    expect(health.ready).toBe(false);
    expect(health.streamConfigured).toBe(false);
  });

  it("health : réseau en panne → ok false avec message, sans throw", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const svc = new VoiceOpsService("dg-key", "el-key", true, undefined, fetchImpl);
    const health = await svc.health(TENANT);
    expect(health.deepgram.ok).toBe(false);
    expect(health.deepgram.error).toContain("ECONNREFUSED");
  });

  it("health : cloneActive reflète le profil vocal du tenant", async () => {
    const profile = {
      voiceIdFor: vi.fn(async (tid: string) => (tid === TENANT ? "voice-x" : undefined)),
    } as unknown as VoiceProfileService;
    const svc = new VoiceOpsService("dg-key", "el-key", true, profile, makeFetch({}));
    expect((await svc.health(TENANT)).cloneActive).toBe(true);
    expect((await svc.health("11111111-1111-1111-1111-111111111111")).cloneActive).toBe(false);
  });

  it("journal : enregistre appels et tours, filtre par tenant, plus récent en premier", () => {
    const svc = new VoiceOpsService("dg", "el", true);
    svc.callStarted("CA1", TENANT);
    svc.callStarted("CA1", TENANT); // doublon ignoré
    svc.callStarted("CA2", "autre-tenant");
    svc.callStarted("CA3", TENANT);
    svc.recordTurn("CA1", { llmMs: 900, ttsFirstChunkMs: 170, totalMs: 1400, interrupted: false });
    svc.recordTurn("CA1", { llmMs: 800, ttsFirstChunkMs: 150, totalMs: 1200, interrupted: true });
    svc.recordTurn("CA-inconnu", { llmMs: 1, ttsFirstChunkMs: 1, totalMs: 1, interrupted: false });

    const calls = svc.listCalls(TENANT);
    expect(calls.map((c) => c.callSid)).toEqual(["CA3", "CA1"]);
    expect(calls[1]?.turns).toHaveLength(2);
    expect(calls[1]?.turns[0]?.llmMs).toBe(900);
    expect(calls[1]?.turns[1]?.interrupted).toBe(true);
    expect(svc.listCalls("autre-tenant").map((c) => c.callSid)).toEqual(["CA2"]);
  });

  it("journal : ring buffer — les vieux appels sortent après 50", () => {
    const svc = new VoiceOpsService("dg", "el", true);
    for (let i = 0; i < 55; i++) svc.callStarted(`CA${i}`, TENANT);
    const calls = svc.listCalls(TENANT, 100);
    expect(calls).toHaveLength(50);
    expect(calls[0]?.callSid).toBe("CA54");
    expect(calls.at(-1)?.callSid).toBe("CA5");
  });
});
