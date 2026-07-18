import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError, NotFoundError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { BillingService } from "../services/billing.js";
import type { SubscriptionService } from "../services/subscription.js";
import type { TenantService } from "../services/tenant.js";

const uuidParam = z.string().uuid();

/**
 * Facturation SaaS du tenant (vague 5) — page /settings du dashboard.
 *
 * GET  /:tenantId           → statut tenant + abonnement courant (ou null)
 * POST /:tenantId/checkout  → URL Stripe Checkout (plan unique)
 * POST /:tenantId/portal    → URL Billing Portal (gérer/annuler, factures)
 */
export function adminBillingRoute(
  billing: BillingService,
  subscription: SubscriptionService,
  tenant: TenantService,
) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  app.get("/:tenantId", async (c) => {
    const tenantId = parseTenantId(c.req.param("tenantId"));
    const t = await tenant.getById(tenantId);
    const sub = await subscription.getActiveByTenant(tenantId);
    return c.json({
      data: {
        tenantStatus: t.status,
        subscription: sub
          ? {
              status: sub.status,
              currentPeriodEnd: sub.currentPeriodEnd,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            }
          : null,
      },
    });
  });

  app.post("/:tenantId/checkout", async (c) => {
    const tenantId = parseTenantId(c.req.param("tenantId"));
    await tenant.getById(tenantId); // 404 si tenant inconnu
    const { url } = await billing.createCheckoutSession(tenantId);
    return c.json({ data: { url } });
  });

  app.post("/:tenantId/portal", async (c) => {
    const tenantId = parseTenantId(c.req.param("tenantId"));
    // Le portal exige un customer Stripe — connu seulement après un 1er checkout
    // (le webhook enregistre stripe_customer_id sur la subscription).
    const subs = await subscription.listByTenant(tenantId);
    const customerId = subs[0]?.stripeCustomerId;
    if (!customerId) {
      throw new NotFoundError("Aucun abonnement Stripe pour ce tenant", "no_subscription");
    }
    const { url } = await billing.createPortalSession(customerId);
    return c.json({ data: { url } });
  });

  return app;
}

function parseTenantId(value: string): string {
  const result = uuidParam.safeParse(value);
  if (!result.success) throw new BadRequestError("tenantId invalide", "validation_error");
  return result.data;
}
