import { Hono } from "hono";
import type { AppEnv } from "../lib/types.js";
import type { SiteService } from "../services/site.js";

/**
 * Rendu public d'un site vitrine : GET /v1/sites/:slug → JSON du site publié
 * (blocs + infos publiques du tenant). Consommé par la page SSR
 * okito.app/s/[slug] (apps/landing). Seuls les sites `published` répondent.
 */
export function sitesPublicRoute(service: SiteService) {
  const app = new Hono<AppEnv>();

  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
      return c.json({ error: { code: "not_found", message: "Site inconnu" } }, 404);
    }
    const site = await service.getPublishedBySlug(slug);
    if (!site) {
      return c.json({ error: { code: "not_found", message: "Site inconnu" } }, 404);
    }
    // Cache court : le SSR de la landing revalide, un site change rarement.
    c.header("Cache-Control", "public, max-age=60");
    return c.json({ data: site });
  });

  return app;
}
