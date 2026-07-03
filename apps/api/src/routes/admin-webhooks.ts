import { WEBHOOK_EVENTS } from "@okito/db";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { WebhookService } from "../services/webhook.js";

const uuidParam = z.string().uuid();

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
});

export function adminWebhooksRoute(service: WebhookService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/webhooks/:tenantId — le secret est masqué (révélé une seule
  // fois à la création). On ne renvoie jamais le secret en clair sur une liste.
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const rows = await service.listByTenant(tenantId);
    return c.json({ data: rows.map((r) => ({ ...r, secret: maskSecret(r.secret) })) });
  });

  // POST /v1/admin/webhooks/:tenantId
  app.post("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await readJson(c);
    const input = parseOrThrow(createSchema, body, "body");
    const row = await service.create({ tenantId, url: input.url, events: input.events });
    return c.json({ data: row }, 201);
  });

  // PATCH /v1/admin/webhooks/:id — toggle active
  app.patch("/:id", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await readJson(c);
    const { active } = parseOrThrow(z.object({ active: z.boolean() }), body, "body");
    const row = await service.setActive(id, active);
    return c.json({ data: row });
  });

  // DELETE /v1/admin/webhooks/:id
  app.delete("/:id", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.remove(id);
    return c.json({ data: { ok: true } });
  });

  return app;
}

function maskSecret(secret: string): string {
  const tail = secret.slice(-4);
  return `whsec_••••${tail}`;
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestError("JSON invalide", "invalid_json");
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.join(".") || label} : ${i.message}`)
    .join("; ");
  throw new BadRequestError(message, "validation_error");
}
