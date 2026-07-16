import { type Database, schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";
import type { WoocommerceConnectionService } from "./woocommerce-connection.js";

/** Borne le nombre de commandes traitées par run/boutique. */
const MAX_ORDERS_PER_RUN = 100;

export interface WoocommerceSyncRunResult {
  connectionsProcessed: number;
  ordersIngested: number;
  errors: number;
}

/**
 * Synchronisation des commandes WooCommerce → event bus (V3).
 *
 * Par boutique active : liste les commandes postérieures au curseur, publie
 * un event `woocommerce.order` par commande (CA en ligne + TVA collectée
 * dans le journal de Jarvis). Bootstrap du curseur à la connexion. Isolation
 * par boutique : une erreur marque la connexion sans bloquer les autres.
 */
export class WoocommerceSyncService {
  constructor(
    private readonly db: Database,
    private readonly connections: WoocommerceConnectionService,
    private readonly bus: EventBusService,
  ) {}

  async runOnce(): Promise<WoocommerceSyncRunResult> {
    const result: WoocommerceSyncRunResult = {
      connectionsProcessed: 0,
      ordersIngested: 0,
      errors: 0,
    };

    const rows = await this.db
      .select()
      .from(schema.tenantWoocommerceConnections)
      .where(eq(schema.tenantWoocommerceConnections.status, "active"));

    for (const conn of rows) {
      result.connectionsProcessed++;
      try {
        result.ordersIngested += await this.syncConnection(conn.id, conn.tenantId);
      } catch (err) {
        result.errors++;
        const message = err instanceof Error ? err.message : String(err);
        await this.db
          .update(schema.tenantWoocommerceConnections)
          .set({ status: "error", lastError: message })
          .where(eq(schema.tenantWoocommerceConnections.id, conn.id));
        logger.error(
          { err, woocommerceConnectionId: conn.id },
          "WooCommerce sync: boutique en erreur",
        );
      }
    }
    return result;
  }

  private async syncConnection(connectionId: string, tenantId: string): Promise<number> {
    const conn = await this.db.query.tenantWoocommerceConnections.findFirst({
      where: (c, { eq: e }) => e(c.id, connectionId),
    });
    if (!conn) return 0;

    const since = conn.orderCursor ?? new Date(0);
    const creds = this.connections.decryptCredentials(conn);
    const orders = await this.connections.listOrdersSince(
      conn.storeUrl,
      creds,
      since,
      MAX_ORDERS_PER_RUN,
    );

    let cursor = conn.orderCursor;
    let ingested = 0;
    for (const order of orders) {
      // Garde-fou si le filtre `after` renvoie la commande pile sur le curseur.
      if (cursor && order.createdAt <= cursor) continue;
      this.bus.publish(
        tenantId,
        "woocommerce.order",
        {
          orderId: order.id,
          orderNumber: order.number,
          totalCents: order.totalCents,
          taxCents: order.taxCents,
          currency: order.currency,
          status: order.status,
          createdAt: order.createdAt.toISOString(),
          woocommerceConnectionId: connectionId,
        },
        "woocommerce",
      );
      ingested++;
      if (!cursor || order.createdAt > cursor) cursor = order.createdAt;
    }

    await this.db
      .update(schema.tenantWoocommerceConnections)
      .set({ orderCursor: cursor, lastSyncAt: new Date(), lastError: null })
      .where(eq(schema.tenantWoocommerceConnections.id, connectionId));
    return ingested;
  }
}
