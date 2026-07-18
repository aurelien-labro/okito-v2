import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import {
  type StripeSubscriptionPayload,
  SubscriptionService,
  tenantStatusForStripe,
} from "./subscription.js";

/**
 * Facturation SaaS (vague 5) : l'état Stripe pilote tenants.status —
 * trial → active au paiement, suspended à l'échec/résiliation.
 */

function payload(tenantId: string, status: string): StripeSubscriptionPayload {
  return {
    tenantId,
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
    stripePriceId: "price_okito",
    status,
    currentPeriodStart: new Date("2026-07-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-08-01T00:00:00Z"),
    cancelAtPeriodEnd: false,
  };
}

describe("tenantStatusForStripe", () => {
  it("mappe les statuts Stripe vers le statut tenant", () => {
    expect(tenantStatusForStripe("active")).toBe("active");
    expect(tenantStatusForStripe("trialing")).toBe("active");
    expect(tenantStatusForStripe("past_due")).toBe("suspended");
    expect(tenantStatusForStripe("canceled")).toBe("suspended");
    expect(tenantStatusForStripe("unpaid")).toBe("suspended");
    // Transitoire : ne touche pas au tenant.
    expect(tenantStatusForStripe("incomplete")).toBeNull();
  });
});

describe("SubscriptionService — sync tenants.status", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let service: SubscriptionService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-billing", name: "Resto", status: "trial" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    service = new SubscriptionService(ctx.db);
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function tenantStatus(): Promise<string | null> {
    const [row] = await ctx.db
      .select({ status: schema.tenants.status })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId));
    return row?.status ?? null;
  }

  it("subscription active → tenant passe trial → active", async () => {
    const sub = await service.upsertFromStripe(payload(tenantId, "active"));
    expect(sub.status).toBe("active");
    expect(await tenantStatus()).toBe("active");
  });

  it("subscription canceled → tenant suspended (update de la même ligne)", async () => {
    await service.upsertFromStripe(payload(tenantId, "active"));
    const updated = await service.upsertFromStripe(payload(tenantId, "canceled"));
    expect(updated.status).toBe("canceled");
    expect(await tenantStatus()).toBe("suspended");
    // Un seul enregistrement subscription (upsert par stripe_subscription_id).
    expect(await service.listByTenant(tenantId)).toHaveLength(1);
  });

  it("statut transitoire (incomplete) → tenant inchangé", async () => {
    await service.upsertFromStripe(payload(tenantId, "incomplete"));
    expect(await tenantStatus()).toBe("trial");
  });
});
