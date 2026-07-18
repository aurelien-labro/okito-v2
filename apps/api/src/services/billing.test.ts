import { describe, expect, it, vi } from "vitest";
import { BadRequestError } from "../lib/errors.js";
import { BillingService } from "./billing.js";

const TENANT = "2853f3bc-cc57-46c1-959e-a07354feb505";

function makeService(response: { status?: number; body?: unknown } = {}) {
  const fetchImpl = vi.fn(async () => {
    const status = response.status ?? 200;
    return new Response(JSON.stringify(response.body ?? { url: "https://stripe.test/s" }), {
      status,
    });
  });
  const billing = new BillingService(
    "sk_test_key",
    "price_okito",
    "https://dashboard.okito.app",
    fetchImpl as unknown as typeof fetch,
  );
  return { billing, fetchImpl };
}

describe("BillingService", () => {
  it("checkout : mode subscription, plan unique, metadata tenant_id", async () => {
    const { billing, fetchImpl } = makeService();
    const { url } = await billing.createCheckoutSession(TENANT);
    expect(url).toBe("https://stripe.test/s");

    const [reqUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(reqUrl).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_key");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price]")).toBe("price_okito");
    expect(body.get("subscription_data[metadata][tenant_id]")).toBe(TENANT);
    expect(body.get("success_url")).toBe("https://dashboard.okito.app/settings?billing=success");
  });

  it("portal : customer + return_url", async () => {
    const { billing, fetchImpl } = makeService({ body: { url: "https://stripe.test/portal" } });
    const { url } = await billing.createPortalSession("cus_123");
    expect(url).toBe("https://stripe.test/portal");
    const [reqUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(reqUrl).toBe("https://api.stripe.com/v1/billing_portal/sessions");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("customer")).toBe("cus_123");
    expect(body.get("return_url")).toBe("https://dashboard.okito.app/settings");
  });

  it("erreur Stripe → BadRequestError avec le status", async () => {
    const { billing } = makeService({ status: 402, body: { error: { message: "card declined" } } });
    await expect(billing.createCheckoutSession(TENANT)).rejects.toThrow(BadRequestError);
  });

  it("réponse sans url → BadRequestError", async () => {
    const { billing } = makeService({ body: {} });
    await expect(billing.createCheckoutSession(TENANT)).rejects.toThrow(
      "Stripe n'a pas renvoyé d'URL",
    );
  });
});
