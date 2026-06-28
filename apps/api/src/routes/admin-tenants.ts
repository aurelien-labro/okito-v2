import { INDUSTRY_VALUES } from "@okito/db";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { AuditLogService } from "../services/audit-log.js";
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

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "format HH:MM");
const serviceWindowSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    start: hhmm,
    end: hhmm,
  })
  .refine((w) => w.start < w.end, { message: "start doit être < end", path: ["end"] });
const servicesSchema = z.array(serviceWindowSchema).max(10);

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "couleur hex format #RRGGBB");
const brandingSchema = z
  .object({
    primaryColor: hex.optional(),
    accentTextColor: hex.optional(),
    logoUrl: z.string().url().max(500).optional(),
    greeting: z.string().max(200).optional(),
    title: z.string().max(60).optional(),
    position: z.enum(["bottom-right", "bottom-left"]).optional(),
  })
  .strict();

const channelsSetSchema = z
  .object({
    email: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
    sms: z.boolean().optional(),
  })
  .strict();
const notificationPreferencesSchema = z
  .object({
    manager: z
      .object({
        onCreate: channelsSetSchema.optional(),
        onCancel: channelsSetSchema.optional(),
      })
      .strict()
      .optional(),
    client: z
      .object({
        onCreate: channelsSetSchema.optional(),
        onReminder: channelsSetSchema.optional(),
      })
      .strict()
      .optional(),
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
  services: servicesSchema.optional(),
  branding: brandingSchema.optional(),
  depositAmountCents: z.number().int().min(0).max(100_000).optional(),
  depositRequiredAboveParty: z.number().int().min(0).max(50).optional(),
  depositCurrency: z.enum(["EUR", "USD", "GBP", "CHF"]).optional(),
  notificationPreferences: notificationPreferencesSchema.optional(),
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
    services: servicesSchema,
    branding: brandingSchema,
    depositAmountCents: z.number().int().min(0).max(100_000),
    depositRequiredAboveParty: z.number().int().min(0).max(50),
    depositCurrency: z.enum(["EUR", "USD", "GBP", "CHF"]),
    notificationPreferences: notificationPreferencesSchema,
    status: statusEnum,
    remindersEnabled: z.boolean(),
  })
  .partial();

const uuidParam = z.string().uuid();

export function adminTenantsRoute(service: TenantService, audit?: AuditLogService) {
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
    await safeAudit(audit, c, {
      action: "tenant.create",
      entityType: "tenant",
      entityId: row.id,
      tenantId: row.id,
      after: row,
    });
    return c.json({ data: row }, 201);
  });

  app.patch("/:id", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await readJson(c);
    const patch = parseOrThrow(updateSchema, body, "body");
    const before = await service.getById(id);
    const row = await service.update(id, patch);
    await safeAudit(audit, c, {
      action: "tenant.update",
      entityType: "tenant",
      entityId: id,
      tenantId: id,
      before,
      after: row,
    });
    return c.json({ data: row });
  });

  app.post("/:id/suspend", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const before = await service.getById(id);
    const row = await service.setStatus(id, "suspended");
    await safeAudit(audit, c, {
      action: "tenant.suspend",
      entityType: "tenant",
      entityId: id,
      tenantId: id,
      before,
      after: row,
    });
    return c.json({ data: row });
  });

  app.post("/:id/activate", async (c) => {
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const before = await service.getById(id);
    const row = await service.setStatus(id, "active");
    await safeAudit(audit, c, {
      action: "tenant.activate",
      entityType: "tenant",
      entityId: id,
      tenantId: id,
      before,
      after: row,
    });
    return c.json({ data: row });
  });

  return app;
}

/**
 * Audit fire-and-log : on ne fait jamais planter une mutation parce que
 * l'écriture du log échoue. On loggue l'erreur côté logger Hono et on continue.
 */
async function safeAudit(
  audit: AuditLogService | undefined,
  c: Context<AppEnv>,
  input: Omit<Parameters<AuditLogService["log"]>[0], "actorUserId" | "ip" | "userAgent">,
): Promise<void> {
  if (!audit) return;
  try {
    await audit.log({
      ...input,
      actorUserId: c.get("userId") ?? null,
      ip: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });
  } catch (err) {
    console.error("[audit_log] échec d'écriture :", err);
  }
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
