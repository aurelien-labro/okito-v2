import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { CoachService } from "../services/coach.js";

const uuidParam = z.string().uuid();

/**
 * Skill Coach — plan de journée structuré (3 priorités + nudge).
 *
 * v1 : uniquement POST pour générer à la demande (pas de persistance dédiée).
 * L'UI appelle cet endpoint quand la page /coach charge, puis via le bouton
 * "Rejouer". Un GET viendra quand la persistance sera en place.
 */
export function adminCoachRoute(coach?: CoachService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  app.post("/:tenantId/plan", async (c) => {
    if (!coach) {
      throw new BadRequestError("Coach non configuré (LLM absent)", "coach_unavailable");
    }
    const parsed = uuidParam.safeParse(c.req.param("tenantId"));
    if (!parsed.success) {
      throw new BadRequestError("tenantId invalide", "validation_error");
    }
    const plan = await coach.plan(parsed.data);
    if (!plan) {
      throw new BadRequestError("Le LLM n'a pas produit de plan", "plan_empty");
    }
    return c.json({ data: plan }, 201);
  });

  return app;
}
