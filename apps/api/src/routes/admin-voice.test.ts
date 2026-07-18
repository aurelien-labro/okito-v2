import { describe, expect, it, vi } from "vitest";
import type { VoiceOpsService } from "../services/voice/voice-ops.js";
import type { VoiceTurnService } from "../services/voice/voice-turn.js";
import { adminVoiceRoute } from "./admin-voice.js";

/**
 * Contrat HTTP des routes d'exploitation voix (/health, /calls) — montées sans
 * middleware auth (celui-ci est testé à part) pour vérifier le câblage + JSON.
 */

const TENANT = "2853f3bc-cc57-46c1-959e-a07354feb505";

function makeApp() {
  const voiceOps = {
    health: vi.fn(async () => ({
      ready: true,
      deepgram: { ok: true, latencyMs: 42, status: 200 },
      elevenlabs: { ok: true, latencyMs: 55, status: 200 },
      streamConfigured: true,
      cloneActive: false,
    })),
    listCalls: vi.fn(() => [
      {
        callSid: "CA123",
        tenantId: TENANT,
        startedAt: new Date("2026-07-18T10:00:00Z"),
        turns: [{ llmMs: 900, ttsFirstChunkMs: 170, totalMs: 1400, interrupted: false }],
      },
    ]),
  } as unknown as VoiceOpsService;
  const app = adminVoiceRoute({} as VoiceTurnService, undefined, voiceOps);
  return { app, voiceOps };
}

describe("adminVoiceRoute — exploitation (/health, /calls)", () => {
  it("GET /:tenantId/health renvoie l'état du pipeline", async () => {
    const { app, voiceOps } = makeApp();
    const res = await app.request(`/${TENANT}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { ready: boolean; deepgram: { ok: boolean } } };
    expect(body.data.ready).toBe(true);
    expect(body.data.deepgram.ok).toBe(true);
    expect(voiceOps.health).toHaveBeenCalledWith(TENANT);
  });

  it("GET /:tenantId/calls renvoie le journal des appels", async () => {
    const { app, voiceOps } = makeApp();
    const res = await app.request(`/${TENANT}/calls`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ callSid: string; turns: Array<{ llmMs: number }> }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.callSid).toBe("CA123");
    expect(body.data[0]?.turns[0]?.llmMs).toBe(900);
    expect(voiceOps.listCalls).toHaveBeenCalledWith(TENANT);
  });

  it("tenantId non-UUID → 400 validation_error", async () => {
    const { app } = makeApp();
    const res = await app.request("/pas-un-uuid/health");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("sans voiceOps : /health absent (404)", async () => {
    const app = adminVoiceRoute({} as VoiceTurnService);
    const res = await app.request(`/${TENANT}/health`);
    expect(res.status).toBe(404);
  });
});
