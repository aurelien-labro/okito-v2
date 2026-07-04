import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { InboxService } from "../services/inbox.js";

const uuidParam = z.string().uuid();

/** Inbox unifiée d'un tenant (emails ingérés, lecture seule). */
export function adminInboxRoute(service: InboxService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/inbox/:tenantId?before=<iso>&limit=30
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const beforeRaw = c.req.query("before");
    const limitRaw = c.req.query("limit");
    const before = beforeRaw ? new Date(beforeRaw) : undefined;
    if (before && Number.isNaN(before.getTime())) {
      throw new BadRequestError("Paramètre before invalide", "invalid_cursor");
    }
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const page = await service.list(tenantId, { before, limit });
    return c.json({ data: page.messages, nextCursor: page.nextCursor });
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
