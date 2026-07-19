import type { Database } from "@okito/db";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError, NotFoundError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import { SOCIAL_TONES, type SocialDrafterService } from "../services/social-drafter.js";

const uuidParam = z.string().uuid();
const draftBody = z.object({
  note: z.string().min(1).max(2000),
  tone: z.enum(SOCIAL_TONES).optional(),
});

/**
 * Skill Social — drafter LLM à la demande.
 *
 * v1 : POST /:tenantId/draft renvoie une proposition prête à copier-coller.
 * Pas de programmation ni de publication auto : le patron colle où il veut.
 */
export function adminSocialRoute(db: Database, drafter?: SocialDrafterService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  app.post("/:tenantId/draft", async (c) => {
    if (!drafter) {
      throw new BadRequestError("Social non configuré (LLM absent)", "social_unavailable");
    }
    const parsedId = uuidParam.safeParse(c.req.param("tenantId"));
    if (!parsedId.success) {
      throw new BadRequestError("tenantId invalide", "validation_error");
    }
    const json = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const parsedBody = draftBody.safeParse(json);
    if (!parsedBody.success) {
      const message = parsedBody.error.issues
        .map((i) => `${i.path.join(".") || "body"} : ${i.message}`)
        .join("; ");
      throw new BadRequestError(message, "validation_error");
    }

    const tenant = await db.query.tenants.findFirst({
      where: (t, { eq }) => eq(t.id, parsedId.data),
      columns: { id: true, name: true },
    });
    if (!tenant) throw new NotFoundError("Tenant introuvable");

    const draft = await drafter.draft({
      note: parsedBody.data.note,
      tone: parsedBody.data.tone,
      tenantName: tenant.name,
    });
    if (!draft) {
      throw new BadRequestError("Le LLM n'a pas produit de brouillon", "draft_empty");
    }
    return c.json({ data: draft }, 201);
  });

  return app;
}
