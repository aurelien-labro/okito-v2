import { type Database, schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";
import type { ShopifyConnectionService } from "./shopify-connection.js";

/** Borne le nombre de commandes traitées par run/boutique. */
const MAX_ORDERS_PER_RUN = 200;

export interface ShopifySyncRunResult {
  connectionsProcessed: number;
  ordersIngested: number;
  errors: number;
}

/**
 * Synchronisation des commandes Shopify → event bus (V3).
 *
 * Par boutique active : liste les commandes postérieures au curseur, publie
 * un event `shopify.order` par commande (CA en ligne + TVA collectée dans le
 * journal de Jarvis). Bootstrap du curseur à la connexion. Isolation par
 * boutique : une erreur marque la connexion sans bloquer les autres.
 */
export class ShopifySyncService {
  constructor(
    private readonly db: Database,
    private readonly connections: ShopifyConnectionService,
    private readonly bus: EventBusService,
  ) {}

  async runOnce(): Promise<ShopifySyncRunResult> {
    const result: ShopifySyncRunResult = {
      connectionsProcessed: 0,
      ordersIngested: 0,
      errors: 0,
    };

    const rows = await this.db
      .select()
      .from(schema.tenantShopifyConnections)
      .where(eq(schema.tenantShopifyConnections.status, "active"));

    for (const conn of rows) {
      result.connectionsProcessed++;
      try {
        result.ordersIngested += await this.syncConnection(conn.id, conn.tenantId);
      } catch (err) {
        result.errors++;
        const message = err instanceof Error ? err.message : String(err);
        await this.db
          .update(schema.tenantShopifyConnections)
          .set({ status: "error", lastError: message })
          .where(eq(schema.tenantShopifyConnections.id, conn.id));
        logger.error({ err, shopifyConnectionId: conn.id }, "Shopify sync: boutique en erreur");
      }
    }
    return result;
  }

  private async syncConnection(connectionId: string, tenantId: string): Promise<number> {
    const conn = await this.db.query.tenantShopifyConnections.findFirst({
      where: (c, { eq: e }) => e(c.id, connectionId),
    });
    if (!conn) return 0;

    const since = conn.orderCursor ?? new Date(0);
    const token = this.connections.decryptToken(conn);
    const orders = await this.connections.listOrdersSince(
      conn.shopDomain,
      token,
      since,
      MAX_ORDERS_PER_RUN,
    );

    let cursor = conn.orderCursor;
    let ingested = 0;
    for (const order of orders) {
      // Le filtre created_at_min de Shopify est inclusif : ignorer la
      // commande pile sur le curseur, déjà ingérée au run précédent.
      if (cursor && order.createdAt <= cursor) continue;
      this.bus.publish(
        tenantId,
        "shopify.order",
        {
          orderId: order.id,
          orderName: order.name,
          totalCents: order.totalCents,
          taxCents: order.taxCents,
          currency: order.currency,
          financialStatus: order.financialStatus,
          createdAt: order.createdAt.toISOString(),
          shopifyConnectionId: connectionId,
        },
        "shopify",
      );
      ingested++;
      if (!cursor || order.createdAt > cursor) cursor = order.createdAt;
    }

    await this.db
      .update(schema.tenantShopifyConnections)
      .set({ orderCursor: cursor, lastSyncAt: new Date(), lastError: null })
      .where(eq(schema.tenantShopifyConnections.id, connectionId));
    return ingested;
  }
}
