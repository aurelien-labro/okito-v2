import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { AuditLogService } from "../services/audit-log.js";

const uuidParam = z.string().uuid();
const limitSchema = z.coerce.number().int().positive().max(500).default(100);

export function adminAuditRoute(service: AuditLogService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/audit?tenantId=&entityType=&entityId=&limit=
  app.get("/", async (c) => {
    const tenantId = c.req.query("tenantId");
    const entityType = c.req.query("entityType");
    const entityId = c.req.query("entityId");
    const limitRaw = c.req.query("limit");

    if (tenantId) parseOrThrow(uuidParam, tenantId, "tenantId");
    const limit = limitRaw ? parseOrThrow(limitSchema, limitRaw, "limit") : undefined;

    const rows = await service.list({
      tenantId: tenantId || undefined,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      limit,
    });
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
