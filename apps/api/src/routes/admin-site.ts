import { SITE_BLOCK_KEYS, type SiteBlocks } from "@okito/db";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { SiteGeneratorService } from "../services/site-generator.js";
import type { SiteService } from "../services/site.js";

const uuidParam = z.string().uuid();
const blockSchema = z.record(z.unknown());
const upsertSchema = z.object({
  slug: z.string().min(1).max(80).optional(),
  theme: z.string().min(1).max(40).optional(),
  blocks: z
    .object(Object.fromEntries(SITE_BLOCK_KEYS.map((k) => [k, blockSchema.optional()])))
    .strict()
    .optional(),
  seo: z
    .object({
      title: z.string().max(120).optional(),
      description: z.string().max(300).optional(),
    })
    .strict()
    .optional(),
});

const generateSchema = z
  .object({
    websiteUrl: z.string().min(1).max(300).optional(),
    businessQuery: z.string().min(1).max(200).optional(),
    force: z.boolean().optional(),
  })
  .refine((v) => v.websiteUrl || v.businessQuery, {
    message: "Fournir au moins websiteUrl ou businessQuery",
  });

/** Site builder d'un tenant : lecture, édition des blocs, publication, génération LLM. */
export function adminSiteRoute(service: SiteService, generator?: SiteGeneratorService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/site/:tenantId — le site du tenant (ou null)
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.get(tenantId) });
  });

  // PUT /v1/admin/site/:tenantId — crée ou met à jour (slug/theme/blocks/seo)
  app.put("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const input = parseOrThrow(upsertSchema, body, "body");
    return c.json({
      data: await service.upsert(tenantId, { ...input, blocks: input.blocks as SiteBlocks }),
    });
  });

  // POST /v1/admin/site/:tenantId/publish — met le site en ligne
  app.post("/:tenantId/publish", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.publish(tenantId) });
  });

  // POST /v1/admin/site/:tenantId/generate — pré-remplit le site via LLM
  // (scan du site existant + fiche Google, comme le diagnostic onboarding).
  if (generator) {
    app.post("/:tenantId/generate", async (c) => {
      const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
      const body = await c.req.json().catch(() => {
        throw new BadRequestError("JSON invalide", "invalid_json");
      });
      const input = parseOrThrow(generateSchema, body, "body");
      return c.json({ data: await generator.generate(tenantId, input) });
    });
  }

  // POST /v1/admin/site/:tenantId/unpublish — repasse en brouillon
  app.post("/:tenantId/unpublish", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.unpublish(tenantId) });
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
