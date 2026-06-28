import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { TableService } from "../services/table.js";

const uuidParam = z.string().uuid();

const createSchema = z.object({
  label: z.string().min(1).max(20),
  capacity: z.number().int().min(1).max(30),
});

const updateSchema = z
  .object({
    label: z.string().min(1).max(20),
    capacity: z.number().int().min(1).max(30),
    active: z.boolean(),
  })
  .partial();

export function adminTablesRoute(service: TableService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/tables/:tenantId?includeInactive=true
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const includeInactive = c.req.query("includeInactive") === "true";
    const rows = await service.listByTenant(tenantId, includeInactive);
    return c.json({ data: rows });
  });

  // POST /v1/admin/tables/:tenantId — créer une table
  app.post("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await readJson(c);
    const input = parseOrThrow(createSchema, body, "body");
    const row = await service.create({ tenantId, label: input.label, capacity: input.capacity });
    return c.json({ data: row }, 201);
  });

  // PATCH /v1/admin/tables/:id — éditer label/capacity/active
  app.patch("/:id", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await readJson(c);
    const patch = parseOrThrow(updateSchema, body, "body");
    const row = await service.update(id, patch);
    return c.json({ data: row });
  });

  // DELETE /v1/admin/tables/:id — supprimer définitivement
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
