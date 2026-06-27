import { type Database, type Subscription, schema } from "@okito/db";
import { desc, eq } from "drizzle-orm";

/**
 * Données extraites d'un event Stripe (customer.subscription.{created,updated,deleted}).
 * Type minimal — on garde l'indépendance vs le SDK Stripe pour pouvoir
 * builder/tester sans la dépendance Stripe en dev.
 */
export interface StripeSubscriptionPayload {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export class SubscriptionService {
  constructor(private readonly db: Database) {}

  /**
   * Upsert : appelé depuis le webhook Stripe pour synchroniser l'état local.
   * Le `stripe_subscription_id` est unique → on update si déjà connu, insert sinon.
   */
  async upsertFromStripe(payload: StripeSubscriptionPayload): Promise<Subscription> {
    const existing = await this.db.query.subscriptions.findFirst({
      where: (s, { eq: e }) => e(s.stripeSubscriptionId, payload.stripeSubscriptionId),
    });

    if (existing) {
      const [updated] = await this.db
        .update(schema.subscriptions)
        .set({
          status: payload.status,
          stripePriceId: payload.stripePriceId,
          currentPeriodStart: payload.currentPeriodStart,
          currentPeriodEnd: payload.currentPeriodEnd,
          cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptions.id, existing.id))
        .returning();
      if (!updated) throw new Error("subscription update returned no row");
      return updated;
    }

    const [inserted] = await this.db
      .insert(schema.subscriptions)
      .values({
        tenantId: payload.tenantId,
        stripeCustomerId: payload.stripeCustomerId,
        stripeSubscriptionId: payload.stripeSubscriptionId,
        stripePriceId: payload.stripePriceId,
        status: payload.status,
        currentPeriodStart: payload.currentPeriodStart,
        currentPeriodEnd: payload.currentPeriodEnd,
        cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
      })
      .returning();
    if (!inserted) throw new Error("subscription insert returned no row");
    return inserted;
  }

  async getActiveByTenant(tenantId: string): Promise<Subscription | null> {
    const row = await this.db.query.subscriptions.findFirst({
      where: (s, { and: a, eq: e, inArray: i }) =>
        a(e(s.tenantId, tenantId), i(s.status, ["active", "trialing"])),
      orderBy: (s) => [desc(s.createdAt)],
    });
    return row ?? null;
  }

  async listByTenant(tenantId: string): Promise<Subscription[]> {
    return this.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, tenantId))
      .orderBy(desc(schema.subscriptions.createdAt));
  }
}
