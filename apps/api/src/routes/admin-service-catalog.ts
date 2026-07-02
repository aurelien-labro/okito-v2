import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { ServiceCatalogService } from "../services/service-catalog.js";

const uuidParam = z.string().uuid();

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullish(),
  durationMinutes: z.number().int().min(5).max(10080).optional(),
  priceCents: z.number().int().min(0).nullish(),
  currency: z.string().length(3).optional(),
  displayOrder: z.number().int().min(0).optional(),
  customFields: z.record(z.unknown()).optional(),
});

const updateSchema = createSchema.extend({ active: z.boolean() }).partial();

export function adminServiceCatalogRoute(service: ServiceCatalogService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/service-catalog/:tenantId?includeInactive=true
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const includeInactive = c.req.query("includeInactive") === "true";
    const rows = await service.listByTenant(tenantId, includeInactive);
    return c.json({ data: rows });
  });

  // POST /v1/admin/service-catalog/:tenantId — créer une prestation
  app.post("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await readJson(c);
    const input = parseOrThrow(createSchema, body, "body");
    const row = await service.create({ tenantId, ...input });
    return c.json({ data: row }, 201);
  });

  // PATCH /v1/admin/service-catalog/:id
  app.patch("/:id", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await readJson(c);
    const patch = parseOrThrow(updateSchema, body, "body");
    if (Object.values(patch).every((v) => v === undefined)) {
      throw new BadRequestError("Aucun champ à modifier", "empty_patch");
    }
    const row = await service.update(id, patch);
    return c.json({ data: row });
  });

  // DELETE /v1/admin/service-catalog/:id
  app.delete("/:id", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.remove(id);
    return c.json({ data: { ok: true } });
  });

  return app;
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
