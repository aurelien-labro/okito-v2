import { Hono } from "hono";
import type { AppEnv } from "../lib/types.js";
import type { TenantAccessService } from "../services/tenant-access.js";

/**
 * GET /v1/tenants/accessible — établissements visibles par l'utilisateur
 * courant : son tenant, ses memberships, et les enfants des groupes dont il
 * est owner. Alimente le switcher du dashboard (auth simple, pas admin).
 * Ne renvoie que les champs utiles au switcher.
 */
export function tenantsAccessibleRoute(service: TenantAccessService) {
  const app = new Hono<AppEnv>();

  app.get("/accessible", async (c) => {
    const userId = c.get("userId") ?? null;
    const claim = c.get("tenantId");
    const claimTenantId = claim && claim !== "admin" ? claim : null;
    const rows = await service.listAccessible(userId, claimTenantId);
    return c.json({
      data: rows.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        parentTenantId: t.parentTenantId,
      })),
    });
  });

  return app;
}
