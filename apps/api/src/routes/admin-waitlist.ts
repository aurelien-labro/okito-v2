import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { WaitlistService } from "../services/waitlist.js";

const uuidParam = z.string().uuid();
const statusEnum = z.enum(["waiting", "notified", "converted", "expired", "cancelled"]);

export function adminWaitlistRoute(service: WaitlistService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/waitlist/:tenantId?status=waiting — liste des entries d'un tenant
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const statusRaw = c.req.query("status");
    const status = statusRaw ? parseOrThrow(statusEnum, statusRaw, "status") : undefined;
    const rows = await service.listByTenant(tenantId, status);
    return c.json({ data: rows });
  });

  // POST /v1/admin/waitlist/:id/notify — marquer comme notifié
  app.post("/:id/notify", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.markNotified(id);
    return c.json({ data: { ok: true } });
  });

  // POST /v1/admin/waitlist/:id/convert — marquer comme converti
  app.post("/:id/convert", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.markConverted(id);
    return c.json({ data: { ok: true } });
  });

  // POST /v1/admin/waitlist/:id/expire — marquer comme expiré manuellement
  app.post("/:id/expire", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.markExpired(id);
    return c.json({ data: { ok: true } });
  });

  // DELETE /v1/admin/waitlist/:id — annuler (le manager ou client a renoncé)
  app.delete("/:id", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.cancel(id);
    return c.json({ data: { ok: true } });
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
