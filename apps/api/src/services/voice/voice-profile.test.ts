import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../../tests/_helpers/pg.js";
import { VoiceProfileService } from "./voice-profile.js";

const CONSENT = { givenBy: "Aurélien Labro", text: "Je consens au clonage de ma voix pour OKITO." };

function sample(name = "voix.mp3") {
  return { audio: Buffer.alloc(2048, 1), mime: "audio/mpeg", filename: name };
}

/** Fetch ElevenLabs factice : /voices/add renvoie un voice_id, DELETE 200. */
function makeFetch(voiceId = "cloned-voice-1") {
  const calls: Array<{ url: string; method?: string }> = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method });
    if (String(url).endsWith("/voices/add")) {
      return new Response(JSON.stringify({ voice_id: voiceId }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("VoiceProfileService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let otherTenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [t] = await ctx.db.insert(schema.tenants).values({ slug: "t1", name: "T1" }).returning();
    const [o] = await ctx.db.insert(schema.tenants).values({ slug: "t2", name: "T2" }).returning();
    if (!t || !o) throw new Error("tenant insert failed");
    tenantId = t.id;
    otherTenantId = o.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("create : clone la voix, stocke le consentement, voiceIdFor renvoie le clone", async () => {
    const { fetchImpl, calls } = makeFetch("voice-abc");
    const svc = new VoiceProfileService(ctx.db, "el-key", fetchImpl);
    const profile = await svc.create({ tenantId, samples: [sample()], consent: CONSENT });
    expect(profile.voiceId).toBe("voice-abc");
    expect(profile.consentGivenBy).toBe(CONSENT.givenBy);
    expect(profile.status).toBe("active");
    expect(calls.some((c) => c.url.endsWith("/voices/add") && c.method === "POST")).toBe(true);
    expect(await svc.voiceIdFor(tenantId)).toBe("voice-abc");
    expect(await svc.voiceIdFor(otherTenantId)).toBeUndefined();
  });

  it("create : refusé sans consentement, sans appel réseau", async () => {
    const { fetchImpl } = makeFetch();
    const svc = new VoiceProfileService(ctx.db, "el-key", fetchImpl);
    await expect(
      svc.create({ tenantId, samples: [sample()], consent: { givenBy: "  ", text: "" } }),
    ).rejects.toThrow(/Consentement requis/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await svc.get(tenantId)).toBeNull();
  });

  it("create : refusé sans échantillon ou avec échantillon vide", async () => {
    const { fetchImpl } = makeFetch();
    const svc = new VoiceProfileService(ctx.db, "el-key", fetchImpl);
    await expect(svc.create({ tenantId, samples: [], consent: CONSENT })).rejects.toThrow(
      /échantillon/i,
    );
    await expect(
      svc.create({
        tenantId,
        samples: [{ audio: Buffer.alloc(0), mime: "audio/mpeg", filename: "vide.mp3" }],
        consent: CONSENT,
      }),
    ).rejects.toThrow(/vide ou trop volumineux/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("create sur profil existant : remplace et supprime l'ancien clone ElevenLabs", async () => {
    const first = makeFetch("voice-old");
    const svc1 = new VoiceProfileService(ctx.db, "el-key", first.fetchImpl);
    await svc1.create({ tenantId, samples: [sample()], consent: CONSENT });

    const second = makeFetch("voice-new");
    const svc2 = new VoiceProfileService(ctx.db, "el-key", second.fetchImpl);
    const profile = await svc2.create({
      tenantId,
      label: "Voix 2",
      samples: [sample("v2.mp3")],
      consent: CONSENT,
    });
    expect(profile.voiceId).toBe("voice-new");
    expect(profile.label).toBe("Voix 2");
    expect(
      second.calls.some((c) => c.url.endsWith("/voices/voice-old") && c.method === "DELETE"),
    ).toBe(true);
    expect(await svc2.voiceIdFor(tenantId)).toBe("voice-new");
  });

  it("ElevenLabs refuse le clonage : erreur propre, rien en base", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("quota", { status: 402 }),
    ) as unknown as typeof fetch;
    const svc = new VoiceProfileService(ctx.db, "el-key", fetchImpl);
    await expect(svc.create({ tenantId, samples: [sample()], consent: CONSENT })).rejects.toThrow(
      /Clonage refusé/,
    );
    expect(await svc.get(tenantId)).toBeNull();
  });

  it("remove : supprime le clone distant et le profil ; introuvable sinon", async () => {
    const { fetchImpl, calls } = makeFetch("voice-del");
    const svc = new VoiceProfileService(ctx.db, "el-key", fetchImpl);
    await svc.create({ tenantId, samples: [sample()], consent: CONSENT });
    await svc.remove(tenantId);
    expect(calls.some((c) => c.url.endsWith("/voices/voice-del") && c.method === "DELETE")).toBe(
      true,
    );
    expect(await svc.get(tenantId)).toBeNull();
    await expect(svc.remove(tenantId)).rejects.toThrow(/Aucun profil/);
  });
});
