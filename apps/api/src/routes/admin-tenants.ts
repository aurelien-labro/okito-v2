import { INDUSTRY_VALUES } from "@okito/db";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { TenantService } from "../services/tenant.js";

const industryEnum = z.enum(INDUSTRY_VALUES);
const statusEnum = z.enum(["active", "suspended", "trial"]);
const featuresSchema = z
  .object({
    voice: z.boolean().optional(),
    reminders: z.boolean().optional(),
    deposits: z.boolean().optional(),
    waitlist: z.boolean().optional(),
    loyalty: z.boolean().optional(),
    multi_resource: z.boolean().optional(),
  })
  .strict();

const createSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug: a-z, 0-9, tirets uniquement"),
  name: z.string().min(1).max(120),
  industry: industryEnum.default("restaurant"),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  timezone: z.string().default("Europe/Paris"),
  capacityMax: z.number().int().positive().max(10_000).default(50),
  features: featuresSchema.optional(),
  status: statusEnum.default("trial"),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(120),
    industry: industryEnum,
    contactEmail: z.string().email().nullable(),
    contactPhone: z.string().nullable(),
    timezone: z.string(),
    capacityMax: z.number().int().positive().max(10_000),
    features: featuresSchema,
    status: statusEnum,
    remindersEnabled: z.boolean(),
  })
  .partial();

const uuidParam = z.string().uuid();

export function adminTenantsRoute(service: TenantService) {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const rows = await service.list();
    return c.json({ data: rows });
  });

  app.get("/:id", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const row = await service.getById(id);
    return c.json({ data: row });
  });

  app.post("/", async (c) => {
    const body = await readJson(c);
    const data = parseOrThrow(createSchema, body, "body");
    const row = await service.create(data);
    return c.json({ data: row }, 201);
  });

  app.patch("/:id", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await readJson(c);
    const patch = parseOrThrow(updateSchema, body, "body");
    const row = await service.update(id, patch);
    return c.json({ data: row });
  });

  app.post("/:id/suspend", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const row = await service.setStatus(id, "suspended");
    return c.json({ data: row });
  });

  app.post("/:id/activate", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const row = await service.setStatus(id, "active");
    return c.json({ data: row });
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
