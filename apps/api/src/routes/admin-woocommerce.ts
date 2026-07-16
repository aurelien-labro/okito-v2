import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { WoocommerceConnectionService } from "../services/woocommerce-connection.js";

const uuidParam = z.string().uuid();
const connectSchema = z.object({
  storeUrl: z.string().min(8).max(255),
  consumerKey: z.string().min(10).max(255),
  consumerSecret: z.string().min(10).max(255),
});

/**
 * Connexion et gestion des boutiques WooCommerce d'un tenant (ventes en
 * ligne, V3). Les clés ne sont jamais renvoyées (le service produit des
 * SafeWoocommerceConnection).
 */
export function adminWoocommerceRoute(service: WoocommerceConnectionService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/woocommerce/:tenantId — boutiques (sans clés)
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.list(tenantId) });
  });

  // POST /v1/admin/woocommerce/:tenantId/connect — { storeUrl, consumerKey, consumerSecret }
  app.post("/:tenantId/connect", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const { storeUrl, consumerKey, consumerSecret } = parseOrThrow(connectSchema, body, "body");
    return c.json(
      { data: await service.connect(tenantId, storeUrl, consumerKey, consumerSecret) },
      201,
    );
  });

  // PATCH /v1/admin/woocommerce/:tenantId/:id — pause / reprise
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

  // DELETE /v1/admin/woocommerce/:tenantId/:id
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
