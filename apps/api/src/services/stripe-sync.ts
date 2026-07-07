import { type Database, schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";
import type { StripeAccountService } from "./stripe-account.js";

/** Borne le nombre de paiements traités par run/compte : le backlog se rattrape. */
const MAX_CHARGES_PER_RUN = 100;

export interface StripeSyncRunResult {
  accountsProcessed: number;
  paymentsIngested: number;
  errors: number;
}

/**
 * Synchronisation des paiements Stripe → event bus (V3).
 *
 * Par compte actif : liste les paiements réussis créés après le curseur,
 * publie un event `payment.received` par paiement (chiffre du jour + TVA
 * collectée + journal). Première sync = bootstrap du curseur seulement (fait
 * à la connexion). Isolation par compte : une erreur marque le compte sans
 * bloquer les autres.
 */
export class StripeSyncService {
  constructor(
    private readonly db: Database,
    private readonly accounts: StripeAccountService,
    private readonly bus: EventBusService,
  ) {}

  async runOnce(): Promise<StripeSyncRunResult> {
    const result: StripeSyncRunResult = { accountsProcessed: 0, paymentsIngested: 0, errors: 0 };

    const rows = await this.db
      .select()
      .from(schema.tenantStripeAccounts)
      .where(eq(schema.tenantStripeAccounts.status, "active"));

    for (const account of rows) {
      result.accountsProcessed++;
      try {
        result.paymentsIngested += await this.syncAccount(account.id, account.tenantId);
      } catch (err) {
        result.errors++;
        const message = err instanceof Error ? err.message : String(err);
        await this.db
          .update(schema.tenantStripeAccounts)
          .set({ status: "error", lastError: message })
          .where(eq(schema.tenantStripeAccounts.id, account.id));
        logger.error({ err, stripeAccountId: account.id }, "Stripe sync: compte en erreur");
      }
    }
    return result;
  }

  private async syncAccount(accountId: string, tenantId: string): Promise<number> {
    // Relit la ligne pour la clé chiffrée + le curseur courant.
    const account = await this.db.query.tenantStripeAccounts.findFirst({
      where: (a, { eq: e }) => e(a.id, accountId),
    });
    if (!account) return 0;

    const since = account.chargeCursor ?? new Date(0);
    const key = this.accounts.decryptKey(account);
    const charges = await this.accounts.listChargesSince(key, since, MAX_CHARGES_PER_RUN);

    let cursor = account.chargeCursor;
    let ingested = 0;
    for (const charge of charges) {
      this.bus.publish(
        tenantId,
        "payment.received",
        {
          chargeId: charge.id,
          amountCents: charge.amountCents,
          currency: charge.currency,
          description: charge.description,
          paidAt: charge.created.toISOString(),
          stripeAccountId: accountId,
        },
        "stripe",
      );
      ingested++;
      if (!cursor || charge.created > cursor) cursor = charge.created;
    }

    await this.db
      .update(schema.tenantStripeAccounts)
      .set({ chargeCursor: cursor, lastSyncAt: new Date(), lastError: null })
      .where(eq(schema.tenantStripeAccounts.id, accountId));
    return ingested;
  }
}
