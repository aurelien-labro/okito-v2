import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../lib/types.js";
import type { SubscriptionService } from "../services/subscription.js";

interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeSubscriptionObject };
}

interface StripeSubscriptionObject {
  id: string;
  customer: string;
  status: string;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  items: {
    data: Array<{ price: { id: string } }>;
  };
  // OKITO place le tenant_id dans la metadata Stripe au moment du checkout.
  metadata: { tenant_id?: string };
}

export interface StripeWebhookConfig {
  webhookSecret: string;
  subscription: SubscriptionService;
}

export function stripeWebhookRoute(config: StripeWebhookConfig) {
  const app = new Hono<AppEnv>();

  app.post("/", async (c) => {
    const signature = c.req.header("stripe-signature");
    if (!signature) {
      return c.json({ error: { code: "missing_signature" } }, 400);
    }

    const rawBody = await c.req.text();
    if (!verifyStripeSignature(rawBody, signature, config.webhookSecret)) {
      logger.warn("Stripe webhook : signature invalide");
      return c.json({ error: { code: "invalid_signature" } }, 401);
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      return c.json({ error: { code: "invalid_json" } }, 400);
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const obj = event.data.object;
        const tenantId = obj.metadata.tenant_id;
        if (!tenantId) {
          logger.error({ eventId: event.id }, "Stripe webhook : metadata.tenant_id manquant");
          return c.json({ received: true, skipped: "missing_tenant_id" });
        }
        const priceId = obj.items.data[0]?.price.id;
        if (!priceId) {
          logger.error({ eventId: event.id }, "Stripe webhook : aucun price.id dans items");
          return c.json({ received: true, skipped: "missing_price" });
        }
        await config.subscription.upsertFromStripe({
          tenantId,
          stripeCustomerId: obj.customer,
          stripeSubscriptionId: obj.id,
          stripePriceId: priceId,
          status: obj.status,
          currentPeriodStart: obj.current_period_start
            ? new Date(obj.current_period_start * 1000)
            : null,
          currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : null,
          cancelAtPeriodEnd: obj.cancel_at_period_end,
        });
        return c.json({ received: true });
      }
      default:
        return c.json({ received: true, ignored: event.type });
    }
  });

  return app;
}

/**
 * Vérifie la signature Stripe selon le format `t=<ts>,v1=<sig>` du header
 * `Stripe-Signature`. On utilise HMAC-SHA256 du payload `<ts>.<raw_body>`
 * avec le webhook secret. Réimplémentation minimale sans dépendre du SDK
 * Stripe officiel.
 *
 * Réf : https://docs.stripe.com/webhooks/signatures#verify-manually
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  const parts = header.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const ts = parts.t;
  const sig = parts.v1;
  if (!ts || !sig) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > toleranceSeconds) return false;

  const signed = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  if (signed.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(signed), Buffer.from(sig));
}
