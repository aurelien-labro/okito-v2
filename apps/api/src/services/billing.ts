import { BadRequestError, NotFoundError } from "../lib/errors.js";

const STRIPE_API = "https://api.stripe.com/v1";

/**
 * Facturation SaaS OKITO (vague 5) — l'abonnement du tenant à OKITO lui-même,
 * à ne pas confondre avec StripeAccountService (connecteur écosystème qui lit
 * les ventes du client avec SA clé Stripe).
 *
 * V1 : plan unique (STRIPE_PRICE_ID). Checkout Stripe hébergé + billing portal.
 * Pas de SDK Stripe — appels REST form-encoded, même pattern que le reste du
 * repo (stripe-account.ts, stripe-webhook.ts). L'état de l'abonnement revient
 * par le webhook /v1/webhooks/stripe (metadata.tenant_id posée ici au checkout).
 */
export class BillingService {
  constructor(
    private readonly secretKey: string,
    private readonly priceId: string,
    private readonly appUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Crée une session Stripe Checkout (mode subscription, plan unique).
   * metadata.tenant_id est posée sur la subscription pour que le webhook
   * sache à quel tenant rattacher les events.
   */
  async createCheckoutSession(tenantId: string): Promise<{ url: string }> {
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": this.priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: tenantId,
      "subscription_data[metadata][tenant_id]": tenantId,
      success_url: `${this.appUrl}/settings?billing=success`,
      cancel_url: `${this.appUrl}/settings?billing=cancelled`,
    });
    const session = await this.stripePost<{ url?: string }>("/checkout/sessions", body);
    if (!session.url) throw new BadRequestError("Stripe n'a pas renvoyé d'URL de checkout");
    return { url: session.url };
  }

  /**
   * Crée une session Billing Portal (gérer/annuler l'abonnement, factures).
   * Nécessite le stripe_customer_id connu via le webhook après le 1er checkout.
   */
  async createPortalSession(stripeCustomerId: string): Promise<{ url: string }> {
    const body = new URLSearchParams({
      customer: stripeCustomerId,
      return_url: `${this.appUrl}/settings`,
    });
    const session = await this.stripePost<{ url?: string }>("/billing_portal/sessions", body);
    if (!session.url) throw new BadRequestError("Stripe n'a pas renvoyé d'URL de portail");
    return { url: session.url };
  }

  private async stripePost<T>(path: string, body: URLSearchParams): Promise<T> {
    const res = await this.fetchImpl(`${STRIPE_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    if (res.status === 404) throw new NotFoundError("Ressource Stripe introuvable");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BadRequestError(`Stripe ${path} a répondu ${res.status} : ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}
