import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { LoyaltyService } from "../services/loyalty.js";

const uuidParam = z.string().uuid();

export function adminLoyaltyRoute(service: LoyaltyService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/loyalty/:tenantId/top?limit=20 — top clients
  app.get("/:tenantId/top", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? Math.max(1, Math.min(100, Number(limitRaw))) : 20;
    const rows = await service.listTopCustomers(tenantId, limit);
    return c.json({ data: rows });
  });

  // GET /v1/admin/loyalty/:tenantId/by-phone/:phone — stats d'un client
  app.get("/:tenantId/by-phone/:phone", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const phone = decodeURIComponent(c.req.param("phone"));
    const row = await service.getByPhone(tenantId, phone);
    return c.json({ data: row });
  });

  // POST /v1/admin/loyalty/:tenantId/stats — batch stats par téléphones
  app.post("/:tenantId/stats", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = (await c.req.json().catch(() => null)) as { phones?: unknown } | null;
    const phones = Array.isArray(body?.phones)
      ? body.phones.filter((p): p is string => typeof p === "string").slice(0, 200)
      : [];
    const rows = await service.statsForPhones(tenantId, phones);
    return c.json({ data: rows });
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
