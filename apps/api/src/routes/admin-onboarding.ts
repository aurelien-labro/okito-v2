import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { OnboardingScanService } from "../services/onboarding-scan.js";

const uuidParam = z.string().uuid();
const bodySchema = z
  .object({
    websiteUrl: z.string().min(4).max(500).optional(),
    businessQuery: z.string().min(2).max(200).optional(),
  })
  .refine((b) => b.websiteUrl || b.businessQuery, {
    message: "websiteUrl ou businessQuery requis",
  });

/** Onboarding magique : premier diagnostic Jarvis (scan site + fiche Google). */
export function adminOnboardingRoute(service: OnboardingScanService) {
  const app = new Hono<AppEnv>();

  // POST /v1/admin/onboarding/:tenantId/diagnostic
  app.post("/:tenantId/diagnostic", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const input = parseOrThrow(bodySchema, body, "body");
    const diagnostic = await service.runDiagnostic(tenantId, input);
    return c.json({ data: diagnostic }, 201);
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
