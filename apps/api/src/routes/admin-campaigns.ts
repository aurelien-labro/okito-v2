import { CAMPAIGN_CHANNELS, CAMPAIGN_SEGMENTS } from "@okito/db";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { CampaignService } from "../services/campaign.js";

const uuidParam = z.string().uuid();
const createSchema = z.object({
  name: z.string().min(1).max(120),
  channel: z.enum(CAMPAIGN_CHANNELS),
  segment: z.enum(CAMPAIGN_SEGMENTS),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(4000),
});

/**
 * Campagnes marketing d'un tenant (vague 3) : création, aperçu des segments,
 * envoi, suppression de brouillon.
 */
export function adminCampaignsRoute(service: CampaignService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/campaigns/:tenantId — historique
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.list(tenantId) });
  });

  // GET /v1/admin/campaigns/:tenantId/segments — comptes par segment
  app.get("/:tenantId/segments", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.segmentCounts(tenantId) });
  });

  // POST /v1/admin/campaigns/:tenantId — crée un brouillon
  app.post("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const input = parseOrThrow(createSchema, body, "body");
    return c.json({ data: await service.create(tenantId, input) }, 201);
  });

  // POST /v1/admin/campaigns/:tenantId/:id/send — envoie le brouillon
  app.post("/:tenantId/:id/send", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    return c.json({ data: await service.send(tenantId, id) });
  });

  // DELETE /v1/admin/campaigns/:tenantId/:id — supprime un brouillon
  app.delete("/:tenantId/:id", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.removeDraft(tenantId, id);
    return c.json({ data: { ok: true } });
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
