import { JARVIS_ACTION_STATUSES } from "@okito/db";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { JarvisActionService } from "../services/jarvis-action.js";

const uuidParam = z.string().uuid();
const statusQuery = z.enum(JARVIS_ACTION_STATUSES).optional();

/**
 * Panneau "Jarvis a agi pour toi" : liste des actions de l'agent, avec
 * approbation (policy approval) et retrait (fenêtre auto_cancellable).
 */
export function adminJarvisActionsRoute(service: JarvisActionService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/jarvis-actions/:tenantId?status=scheduled
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const status = parseOrThrow(statusQuery, c.req.query("status"), "status");
    const rows = await service.list(tenantId, status);
    return c.json({ data: rows });
  });

  // POST /v1/admin/jarvis-actions/:tenantId/:id/approve
  app.post("/:tenantId/:id/approve", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const row = await service.approve(tenantId, id);
    return c.json({ data: row });
  });

  // POST /v1/admin/jarvis-actions/:tenantId/:id/cancel
  app.post("/:tenantId/:id/cancel", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const row = await service.cancel(tenantId, id);
    return c.json({ data: row });
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
