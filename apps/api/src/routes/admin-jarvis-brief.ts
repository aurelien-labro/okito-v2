import { type Database, schema } from "@okito/db";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError, NotFoundError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { JarvisAdvisorService } from "../services/jarvis-advisor.js";
import type { SpeechToText } from "../services/voice/stt.js";
import type { TextToSpeech } from "../services/voice/tts.js";

/** STT + TTS pour parler à Jarvis à la voix (réutilise le pipeline voix maison). */
export interface JarvisVoiceDeps {
  stt: SpeechToText;
  tts: TextToSpeech;
}

const uuidParam = z.string().uuid();
const messagesSchema = z
  .array(
    z.object({
      role: z.enum(["user", "model"]),
      content: z.string().min(1).max(4000),
    }),
  )
  .max(20);
const chatBodySchema = z.object({ messages: messagesSchema.refine((m) => m.length >= 1) });

/** Mêmes bornes audio que le banc voix (/v1/admin/voice). */
const VOICE_MIMES = ["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4"];
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const voiceChatBodySchema = z.object({
  audioBase64: z.string().min(1),
  mime: z.enum(VOICE_MIMES as [string, ...string[]]),
  /** Historique du fil (le tour vocal transcrit y est ajouté côté serveur). */
  history: messagesSchema.optional(),
});

/**
 * Zone "Brief de Jarvis" du dashboard.
 *
 * GET : dernier brief publié sur le bus (event jarvis.brief.generated).
 * POST : régénération à la demande ("Jarvis, refais le point maintenant") —
 * disponible seulement si l'Advisor est câblé (LLM configuré).
 */
export function adminJarvisBriefRoute(
  db: Database,
  advisor?: JarvisAdvisorService,
  voice?: JarvisVoiceDeps,
) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/jarvis-brief/:tenantId — dernier brief
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const [row] = await db
      .select()
      .from(schema.events)
      .where(
        and(eq(schema.events.tenantId, tenantId), eq(schema.events.type, "jarvis.brief.generated")),
      )
      .orderBy(desc(schema.events.createdAt))
      .limit(1);
    if (!row) throw new NotFoundError("Aucun brief généré pour ce tenant");
    return c.json({ data: { ...(row.payload as Record<string, unknown>), at: row.createdAt } });
  });

  // POST /v1/admin/jarvis-brief/:tenantId/chat — question au journal
  app.post("/:tenantId/chat", async (c) => {
    if (!advisor) {
      throw new BadRequestError("Advisor non configuré (LLM absent)", "advisor_unavailable");
    }
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const { messages } = parseOrThrow(chatBodySchema, body, "body");
    const reply = await advisor.chat(tenantId, messages);
    if (!reply) throw new BadRequestError("Le LLM n'a pas produit de réponse", "chat_empty");
    return c.json({ data: { reply } });
  });

  // POST /v1/admin/jarvis-brief/:tenantId/voice-chat — parler à Jarvis au micro.
  // Audio du patron → transcript (Deepgram) → chat advisor → réponse audio (mp3).
  app.post("/:tenantId/voice-chat", async (c) => {
    if (!advisor) {
      throw new BadRequestError("Advisor non configuré (LLM absent)", "advisor_unavailable");
    }
    if (!voice) {
      throw new BadRequestError(
        "Voix non configurée (clés Deepgram/ElevenLabs absentes)",
        "voice_unavailable",
      );
    }
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const input = parseOrThrow(voiceChatBodySchema, body, "body");

    const audio = Buffer.from(input.audioBase64, "base64");
    if (audio.length === 0) throw new BadRequestError("Audio vide", "empty_audio");
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new BadRequestError("Audio trop volumineux (max 6 Mo)", "audio_too_large");
    }

    const { text: transcript } = await voice.stt.transcribe(audio, input.mime);
    if (!transcript) {
      throw new BadRequestError("Je n'ai rien entendu — réessaie", "empty_transcript");
    }

    const messages = [...(input.history ?? []), { role: "user" as const, content: transcript }];
    const reply = await advisor.chat(tenantId, messages.slice(-20));
    if (!reply) throw new BadRequestError("Le LLM n'a pas produit de réponse", "chat_empty");

    const spoken = await voice.tts.synthesize(reply);
    return c.json({
      data: {
        transcript,
        reply,
        audioBase64: spoken.audio.toString("base64"),
        mime: spoken.mime,
      },
    });
  });

  // POST /v1/admin/jarvis-brief/:tenantId — régénérer maintenant
  app.post("/:tenantId", async (c) => {
    if (!advisor) {
      throw new BadRequestError("Advisor non configuré (LLM absent)", "advisor_unavailable");
    }
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const brief = await advisor.generateBrief(tenantId);
    if (!brief) throw new BadRequestError("Le LLM n'a pas produit de brief", "brief_empty");
    return c.json({ data: brief }, 201);
  });

  return app;
}

function parseOrThrow<T>(schemaArg: z.ZodType<T>, value: unknown, label: string): T {
  const result = schemaArg.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.join(".") || label} : ${i.message}`)
    .join("; ");
  throw new BadRequestError(message, "validation_error");
}
