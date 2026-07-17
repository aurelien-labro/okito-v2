import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { VoiceProfileService } from "../services/voice/voice-profile.js";
import type { VoiceTurnService } from "../services/voice/voice-turn.js";

/** ~6 Mo décodés — même borne que l'upload de factures fournisseurs. */
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const ALLOWED_MIMES = ["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4"];

const uuidParam = z.string().uuid();
const turnSchema = z.object({
  audioBase64: z.string().min(1),
  mime: z.enum(ALLOWED_MIMES as [string, ...string[]]),
  sessionKey: z.string().min(1).max(120),
});

const profileSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  samples: z
    .array(
      z.object({
        audioBase64: z.string().min(1),
        mime: z.enum(ALLOWED_MIMES as [string, ...string[]]),
        filename: z.string().min(1).max(120),
      }),
    )
    .min(1)
    .max(10),
  consent: z.object({
    givenBy: z.string().min(1).max(120),
    text: z.string().min(10).max(2000),
  }),
});

/** Banc d'essai du pipeline voix maison : un tour audio → transcript + réponse audio. */
export function adminVoiceRoute(service: VoiceTurnService, voiceProfile?: VoiceProfileService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // POST /v1/admin/voice/:tenantId/turn
  app.post("/:tenantId/turn", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const input = parseOrThrow(turnSchema, body, "body");

    const audio = Buffer.from(input.audioBase64, "base64");
    if (audio.length === 0) throw new BadRequestError("Audio vide", "empty_audio");
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new BadRequestError("Audio trop volumineux (max 6 Mo)", "audio_too_large");
    }

    const result = await service.handle({
      tenantId,
      sessionKey: input.sessionKey,
      audio,
      mime: input.mime,
    });
    return c.json({
      data: {
        transcript: result.transcript,
        reply: result.reply,
        conversationId: result.conversationId,
        status: result.status,
        audioBase64: result.audio.toString("base64"),
        mime: result.mime,
      },
    });
  });

  // Voice cloning : profil vocal du tenant (voix clonée du patron).
  if (voiceProfile) {
    // GET /v1/admin/voice/:tenantId/profile
    app.get("/:tenantId/profile", async (c) => {
      const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
      const profile = await voiceProfile.get(tenantId);
      return c.json({ data: profile });
    });

    // POST /v1/admin/voice/:tenantId/profile — clone la voix (consentement requis).
    app.post("/:tenantId/profile", async (c) => {
      const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
      const body = await c.req.json().catch(() => {
        throw new BadRequestError("JSON invalide", "invalid_json");
      });
      const input = parseOrThrow(profileSchema, body, "body");
      const samples = input.samples.map((s) => {
        const audio = Buffer.from(s.audioBase64, "base64");
        if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
          throw new BadRequestError("Échantillon vide ou trop volumineux (max 6 Mo)", "bad_sample");
        }
        return { audio, mime: s.mime, filename: s.filename };
      });
      const profile = await voiceProfile.create({
        tenantId,
        label: input.label,
        samples,
        consent: input.consent,
      });
      return c.json({ data: profile }, 201);
    });

    // DELETE /v1/admin/voice/:tenantId/profile
    app.delete("/:tenantId/profile", async (c) => {
      const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
      await voiceProfile.remove(tenantId);
      return c.json({ data: { deleted: true } });
    });
  }

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
