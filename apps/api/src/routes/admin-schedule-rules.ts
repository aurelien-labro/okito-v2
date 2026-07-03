import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { ScheduleRuleService } from "../services/schedule-rule.js";

const uuidParam = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hm = z.string().regex(/^\d{2}:\d{2}$/);

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("weekly_closed"),
    payload: z.object({ weekdays: z.array(z.number().int().min(0).max(6)).min(1) }),
  }),
  z.object({
    kind: z.literal("date_closed"),
    payload: z
      .object({ date: isoDate.optional(), from: isoDate.optional(), to: isoDate.optional() })
      .refine(
        (p) => (!!p.date && !p.from && !p.to) || (!p.date && !!p.from && !!p.to && p.from <= p.to),
        { message: "Fournir soit date, soit from+to (avec from <= to)" },
      ),
  }),
  z.object({
    kind: z.literal("date_special"),
    payload: z.object({
      date: isoDate,
      services: z.array(z.object({ label: z.string().min(1), start: hm, end: hm })).min(1),
    }),
  }),
]);

export function adminScheduleRulesRoute(service: ScheduleRuleService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/schedule-rules/:tenantId?includeInactive=true
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const includeInactive = c.req.query("includeInactive") === "true";
    const rows = await service.listByTenant(tenantId, includeInactive);
    return c.json({ data: rows });
  });

  // POST /v1/admin/schedule-rules/:tenantId
  app.post("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await readJson(c);
    const input = parseOrThrow(createSchema, body, "body");
    const row = await service.create({ tenantId, kind: input.kind, payload: input.payload });
    return c.json({ data: row }, 201);
  });

  // PATCH /v1/admin/schedule-rules/:id — toggle active
  app.patch("/:id", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await readJson(c);
    const { active } = parseOrThrow(z.object({ active: z.boolean() }), body, "body");
    const row = await service.setActive(id, active);
    return c.json({ data: row });
  });

  // DELETE /v1/admin/schedule-rules/:id
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
