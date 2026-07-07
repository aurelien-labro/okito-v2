import { type Database, schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { BankConnectionService } from "./bank-connection.js";
import type { EventBusService } from "./event-bus.js";

/** Borne le nombre de transactions traitées par run/connexion. */
const MAX_TRANSACTIONS_PER_RUN = 200;

export interface BankSyncRunResult {
  connectionsProcessed: number;
  transactionsIngested: number;
  errors: number;
}

/**
 * Synchronisation des transactions bancaires → event bus (V3).
 *
 * Par connexion active : liste les transactions postérieures au curseur,
 * publie un event `bank.transaction` par mouvement (rapprochement facture ↔
 * encaissement, journal de Jarvis). Bootstrap du curseur à la connexion.
 * Isolation par connexion : une erreur marque la connexion sans bloquer les
 * autres.
 */
export class BankSyncService {
  constructor(
    private readonly db: Database,
    private readonly connections: BankConnectionService,
    private readonly bus: EventBusService,
  ) {}

  async runOnce(): Promise<BankSyncRunResult> {
    const result: BankSyncRunResult = {
      connectionsProcessed: 0,
      transactionsIngested: 0,
      errors: 0,
    };

    const rows = await this.db
      .select()
      .from(schema.tenantBankConnections)
      .where(eq(schema.tenantBankConnections.status, "active"));

    for (const conn of rows) {
      result.connectionsProcessed++;
      try {
        result.transactionsIngested += await this.syncConnection(conn.id, conn.tenantId);
      } catch (err) {
        result.errors++;
        const message = err instanceof Error ? err.message : String(err);
        await this.db
          .update(schema.tenantBankConnections)
          .set({ status: "error", lastError: message })
          .where(eq(schema.tenantBankConnections.id, conn.id));
        logger.error({ err, bankConnectionId: conn.id }, "Bank sync: connexion en erreur");
      }
    }
    return result;
  }

  private async syncConnection(connectionId: string, tenantId: string): Promise<number> {
    const conn = await this.db.query.tenantBankConnections.findFirst({
      where: (c, { eq: e }) => e(c.id, connectionId),
    });
    if (!conn) return 0;

    const since = conn.transactionCursor ?? new Date(0);
    const token = this.connections.decryptToken(conn);
    const txns = await this.connections.listTransactionsSince(
      token,
      since,
      MAX_TRANSACTIONS_PER_RUN,
    );

    let cursor = conn.transactionCursor;
    let ingested = 0;
    for (const txn of txns) {
      this.bus.publish(
        tenantId,
        "bank.transaction",
        {
          transactionId: txn.id,
          amountCents: txn.amountCents,
          currency: txn.currency,
          description: txn.description,
          direction: txn.amountCents < 0 ? "debit" : "credit",
          bookedAt: txn.date.toISOString(),
          bankConnectionId: connectionId,
        },
        "bank",
      );
      ingested++;
      if (!cursor || txn.date > cursor) cursor = txn.date;
    }

    await this.db
      .update(schema.tenantBankConnections)
      .set({ transactionCursor: cursor, lastSyncAt: new Date(), lastError: null })
      .where(eq(schema.tenantBankConnections.id, connectionId));
    return ingested;
  }
}
