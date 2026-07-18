import { type Database, schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import type { JarvisAdvisorService, JarvisBrief } from "../services/jarvis-advisor.js";
import { adminJarvisBriefRoute } from "./admin-jarvis-brief.js";

describe("adminJarvisBriefRoute", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-brief", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET renvoie le dernier brief publié", async () => {
    await ctx.db.insert(schema.events).values([
      {
        tenantId,
        type: "jarvis.brief.generated",
        source: "jarvis",
        payload: { text: "Ancien brief" },
        createdAt: new Date(Date.now() - 3600_000),
      },
      {
        tenantId,
        type: "jarvis.brief.generated",
        source: "jarvis",
        payload: { text: "Brief du jour", eventCount: 12 },
      },
    ]);
    const app = adminJarvisBriefRoute(ctx.db);

    const res = await app.request(`/${tenantId}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { text: string; eventCount: number } };
    expect(body.data).toMatchObject({ text: "Brief du jour", eventCount: 12 });
  });

  it("GET 404 si aucun brief", async () => {
    const app = adminJarvisBriefRoute(ctx.db);
    const res = await app.request(`/${tenantId}`);
    expect(res.status).toBe(404);
  });

  it("POST régénère via l'advisor", async () => {
    const fakeAdvisor = {
      generateBrief: async (id: string): Promise<JarvisBrief> => ({
        tenantId: id,
        text: "Brief frais",
        eventCount: 3,
        generatedAt: new Date(),
      }),
    } as unknown as JarvisAdvisorService;
    const app = adminJarvisBriefRoute(ctx.db, fakeAdvisor);

    const res = await app.request(`/${tenantId}`, { method: "POST" });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { text: string } };
    expect(body.data.text).toBe("Brief frais");
  });

  it("POST 400 si advisor absent (LLM non configuré)", async () => {
    const app = adminJarvisBriefRoute(ctx.db);
    const res = await app.request(`/${tenantId}`, { method: "POST" });
    expect(res.status).toBe(400);
  });
});

/**
 * Voix Jarvis (/voice-chat, vague 5) — pas besoin de vraie DB : la route
 * n'y touche pas. Audio → transcript → chat advisor → réponse audio.
 */
describe("adminJarvisBriefRoute — /voice-chat (voix Jarvis)", () => {
  const TENANT = "2853f3bc-cc57-46c1-959e-a07354feb505";
  const AUDIO = Buffer.alloc(2048, 1).toString("base64");

  function makeApp(overrides?: { transcript?: string }) {
    const advisor = {
      chat: vi.fn(async () => "Ta journée est calme, 12 couverts ce soir."),
    } as unknown as JarvisAdvisorService;
    const stt = {
      transcribe: vi.fn(async () => ({ text: overrides?.transcript ?? "résume ma journée" })),
    };
    const tts = {
      synthesize: vi.fn(async () => ({ audio: Buffer.from([9, 9, 9]), mime: "audio/mpeg" })),
    };
    const app = adminJarvisBriefRoute({} as Database, advisor, { stt, tts });
    return { app, advisor, stt, tts };
  }

  function post(app: ReturnType<typeof makeApp>["app"], body: unknown) {
    return app.request(`/${TENANT}/voice-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("audio → transcript + réponse texte + réponse audio, historique transmis", async () => {
    const { app, advisor, stt, tts } = makeApp();
    const history = [
      { role: "user" as const, content: "salut" },
      { role: "model" as const, content: "Bonjour !" },
    ];
    const res = await post(app, { audioBase64: AUDIO, mime: "audio/webm", history });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { transcript: string; reply: string; audioBase64: string; mime: string };
    };
    expect(body.data.transcript).toBe("résume ma journée");
    expect(body.data.reply).toContain("12 couverts");
    expect(body.data.mime).toBe("audio/mpeg");
    expect(Buffer.from(body.data.audioBase64, "base64")).toEqual(Buffer.from([9, 9, 9]));
    expect(stt.transcribe).toHaveBeenCalledOnce();
    expect(advisor.chat).toHaveBeenCalledWith(TENANT, [
      ...history,
      { role: "user", content: "résume ma journée" },
    ]);
    expect(tts.synthesize).toHaveBeenCalledWith(body.data.reply);
  });

  it("transcript vide → 400 empty_transcript, pas d'appel LLM ni TTS", async () => {
    const { app, advisor, tts } = makeApp({ transcript: "" });
    const res = await post(app, { audioBase64: AUDIO, mime: "audio/webm" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("empty_transcript");
    expect(advisor.chat).not.toHaveBeenCalled();
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("mime non supporté ou audio vide → 400", async () => {
    const { app } = makeApp();
    const bad = await post(app, { audioBase64: AUDIO, mime: "video/mp4" });
    expect(bad.status).toBe(400);
    const empty = await post(app, {
      audioBase64: Buffer.alloc(0).toString("base64"),
      mime: "audio/webm",
    });
    expect(empty.status).toBe(400);
  });

  it("sans deps voix : 400 voice_unavailable", async () => {
    const advisor = { chat: vi.fn() } as unknown as JarvisAdvisorService;
    const app = adminJarvisBriefRoute({} as Database, advisor);
    const res = await post(app, { audioBase64: AUDIO, mime: "audio/webm" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("voice_unavailable");
  });
});
