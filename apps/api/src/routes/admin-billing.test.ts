import { describe, expect, it, vi } from "vitest";
import type { BillingService } from "../services/billing.js";
import type { SubscriptionService } from "../services/subscription.js";
import type { TenantService } from "../services/tenant.js";
import { adminBillingRoute } from "./admin-billing.js";

/**
 * Contrat HTTP de /v1/admin/billing — montée sans middleware auth (testé à
 * part), services mockés : on vérifie le câblage + les formes JSON.
 */

const TENANT = "2853f3bc-cc57-46c1-959e-a07354feb505";

function makeApp(opts: { sub?: unknown; subs?: unknown[] } = {}) {
  const billing = {
    createCheckoutSession: vi.fn(async () => ({ url: "https://stripe.test/checkout" })),
    createPortalSession: vi.fn(async () => ({ url: "https://stripe.test/portal" })),
  } as unknown as BillingService;
  const subscription = {
    getActiveByTenant: vi.fn(async () => opts.sub ?? null),
    listByTenant: vi.fn(async () => opts.subs ?? []),
  } as unknown as SubscriptionService;
  const tenant = {
    getById: vi.fn(async () => ({ id: TENANT, status: "trial" })),
  } as unknown as TenantService;
  return { app: adminBillingRoute(billing, subscription, tenant), billing };
}

describe("adminBillingRoute", () => {
  it("GET /:tenantId → statut tenant + abonnement null", async () => {
    const { app } = makeApp();
    const res = await app.request(`/${TENANT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { tenantStatus: string; subscription: null } };
    expect(body.data.tenantStatus).toBe("trial");
    expect(body.data.subscription).toBeNull();
  });

  it("GET /:tenantId → abonnement actif exposé", async () => {
    const { app } = makeApp({
      sub: { status: "active", currentPeriodEnd: new Date(), cancelAtPeriodEnd: false },
    });
    const res = await app.request(`/${TENANT}`);
    const body = (await res.json()) as { data: { subscription: { status: string } } };
    expect(body.data.subscription.status).toBe("active");
  });

  it("POST /:tenantId/checkout → url Stripe", async () => {
    const { app, billing } = makeApp();
    const res = await app.request(`/${TENANT}/checkout`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string } };
    expect(body.data.url).toBe("https://stripe.test/checkout");
    expect(billing.createCheckoutSession).toHaveBeenCalledWith(TENANT);
  });

  it("POST /:tenantId/portal sans abonnement → 404 no_subscription", async () => {
    const { app } = makeApp();
    const res = await app.request(`/${TENANT}/portal`, { method: "POST" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("no_subscription");
  });

  it("POST /:tenantId/portal avec abonnement → url portail", async () => {
    const { app, billing } = makeApp({ subs: [{ stripeCustomerId: "cus_123" }] });
    const res = await app.request(`/${TENANT}/portal`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(billing.createPortalSession).toHaveBeenCalledWith("cus_123");
  });

  it("tenantId non-uuid → 400", async () => {
    const { app } = makeApp();
    const res = await app.request("/pas-un-uuid", { method: "GET" });
    expect(res.status).toBe(400);
  });
});
