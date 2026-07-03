import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import { signFeed } from "../lib/ical.js";
import type { AppEnv } from "../lib/types.js";

const uuidParam = z.string().uuid();

export interface AdminIcalDeps {
  secret: string;
  /** Base publique de l'API (ex: https://api.okito.app) pour construire l'URL du feed. */
  apiBaseUrl: string;
}

/**
 * Retourne les URLs signées du flux iCal d'un tenant : une pour le
 * téléchargement (https) et une pour l'abonnement live (webcal://).
 */
export function adminIcalRoute(deps: AdminIcalDeps) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/ical/:tenantId
  app.get("/:tenantId", (c) => {
    const parsed = uuidParam.safeParse(c.req.param("tenantId"));
    if (!parsed.success) throw new BadRequestError("tenantId invalide", "validation_error");
    const tenantId = parsed.data;
    const sig = signFeed(tenantId, deps.secret);
    const base = deps.apiBaseUrl.replace(/\/$/, "");
    const path = `/feed/${tenantId}.ics?sig=${sig}`;
    const httpsUrl = `${base}${path}`;
    const webcalUrl = httpsUrl.replace(/^https?:\/\//, "webcal://");
    return c.json({ data: { httpsUrl, webcalUrl } });
  });

  return app;
}
