import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { StatsService } from "../services/stats.js";

const uuidParam = z.string().uuid();
const daysSchema = z.coerce.number().int().min(1).max(365);

export function adminStatsRoute(service: StatsService) {
  const app = new Hono<AppEnv>();

  /**
   * GET /v1/admin/stats/:tenantId/overview?days=30
   * Retourne les agrégations business sur la période demandée.
   */
  app.get("/:tenantId/overview", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const daysRaw = c.req.query("days");
    const days = daysRaw ? parseOrThrow(daysSchema, daysRaw, "days") : 30;
    const overview = await service.overview(tenantId, days);
    return c.json({ data: overview });
  });

  return app;
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.join(".") || label} : ${i.message}`)
    .join("; ");
  throw new BadRequestError(message, "validation_error");
}
