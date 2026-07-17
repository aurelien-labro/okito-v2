import { JARVIS_POLICIES } from "@okito/db";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { JarvisToolSettingsService } from "../services/jarvis-tool-settings.js";

const uuidParam = z.string().uuid();
const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    policyOverride: z.enum(JARVIS_POLICIES).nullable().optional(),
  })
  .refine((v) => v.enabled !== undefined || v.policyOverride !== undefined, {
    message: "Fournir enabled et/ou policyOverride",
  });

/** Boutique d'automatisations : catalogue des boucles Jarvis + réglages tenant. */
export function adminJarvisToolsRoute(service: JarvisToolSettingsService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/jarvis-tools/:tenantId — catalogue fusionné avec les réglages
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.list(tenantId) });
  });

  // PATCH /v1/admin/jarvis-tools/:tenantId/:type — active/désactive, force la policy
  app.patch("/:tenantId/:type", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const type = c.req.param("type");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const input = parseOrThrow(patchSchema, body, "body");
    if (input.enabled !== undefined) await service.setEnabled(tenantId, type, input.enabled);
    if (input.policyOverride !== undefined) {
      await service.setPolicyOverride(tenantId, type, input.policyOverride);
    }
    const tools = await service.list(tenantId);
    return c.json({ data: tools.find((t) => t.type === type) ?? null });
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
