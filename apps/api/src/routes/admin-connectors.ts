import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { ConnectorMarketplaceService } from "../services/connector-marketplace.js";

const uuidParam = z.string().uuid();
const installSchema = z.object({
  /** Chaîne JSON EXACTE du manifest telle que signée par l'éditeur. */
  manifest: z.string().min(2).max(10_000),
  /** Signature Ed25519 du manifest, base64. */
  signature: z.string().min(1).max(2_000),
});
const patchSchema = z.object({ enabled: z.boolean() });

/** Marketplace de connecteurs tiers signés : installation, réglages, retrait. */
export function adminConnectorsRoute(service: ConnectorMarketplaceService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/connectors/:tenantId — connecteurs installés (sans secret)
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.list(tenantId) });
  });

  // POST /v1/admin/connectors/:tenantId — installe un manifest signé
  app.post("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const input = parseOrThrow(installSchema, body, "body");
    const connector = await service.install(tenantId, input.manifest, input.signature);
    return c.json({ data: connector }, 201);
  });

  // PATCH /v1/admin/connectors/:tenantId/:connectorId — active/coupe
  app.patch("/:tenantId/:connectorId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const input = parseOrThrow(patchSchema, body, "body");
    const connector = await service.setEnabled(tenantId, c.req.param("connectorId"), input.enabled);
    return c.json({ data: connector });
  });

  // DELETE /v1/admin/connectors/:tenantId/:connectorId — désinstalle
  app.delete("/:tenantId/:connectorId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    await service.uninstall(tenantId, c.req.param("connectorId"));
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
