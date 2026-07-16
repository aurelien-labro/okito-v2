import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { ShopifyConnectionService } from "../services/shopify-connection.js";

const uuidParam = z.string().uuid();
const connectSchema = z.object({
  shopDomain: z.string().min(4).max(255),
  accessToken: z.string().min(10).max(2048),
});

/**
 * Connexion et gestion des boutiques Shopify d'un tenant (ventes en ligne, V3).
 * Le jeton n'est jamais renvoyé (le service produit des SafeShopifyConnection).
 */
export function adminShopifyRoute(service: ShopifyConnectionService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/shopify/:tenantId — boutiques (sans jeton)
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.list(tenantId) });
  });

  // POST /v1/admin/shopify/:tenantId/connect — { shopDomain, accessToken }
  app.post("/:tenantId/connect", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const { shopDomain, accessToken } = parseOrThrow(connectSchema, body, "body");
    return c.json({ data: await service.connect(tenantId, shopDomain, accessToken) }, 201);
  });

  // PATCH /v1/admin/shopify/:tenantId/:id — pause / reprise
  app.patch("/:tenantId/:id", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const { status } = parseOrThrow(
      z.object({ status: z.enum(["active", "paused"]) }),
      body,
      "body",
    );
    return c.json({ data: await service.setStatus(tenantId, id, status) });
  });

  // DELETE /v1/admin/shopify/:tenantId/:id
  app.delete("/:tenantId/:id", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.remove(tenantId, id);
    return c.json({ data: { ok: true } });
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
