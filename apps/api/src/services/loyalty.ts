import { type Database, schema } from "@okito/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export interface CustomerStats {
  customerPhone: string;
  customerName: string;
  visitCount: number;
  firstVisit: string | null;
  lastVisit: string | null;
  isReturning: boolean;
}

/**
 * Programme fidélité — pas de table dédiée, agrégation à la volée sur
 * reservations. Un "visiteur" = un téléphone unique avec au moins une résa
 * confirmée ou completed. "Habitué" = 3+ visites.
 *
 * Avantages : zéro double-écriture, source de vérité = résas, pas de drift.
 * Inconvénient : recalcul à chaque requête. Acceptable jusqu'à ~50k résas
 * par tenant. Au-delà, vue matérialisée.
 */
const LOYALTY_RETURNING_THRESHOLD = 3;
const LOYALTY_COUNT_STATUSES = ["confirmed", "completed"] as const;

export class LoyaltyService {
  constructor(private readonly db: Database) {}

  /** Stats d'un seul client (téléphone) pour un tenant. */
  async getByPhone(tenantId: string, phone: string): Promise<CustomerStats | null> {
    const rows = await this.db
      .select({
        customerPhone: schema.reservations.customerPhone,
        customerName: schema.reservations.customerName,
        visitCount: sql<number>`count(*)::int`,
        firstVisit: sql<string | null>`min(${schema.reservations.dateReservation})::text`,
        lastVisit: sql<string | null>`max(${schema.reservations.dateReservation})::text`,
      })
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.tenantId, tenantId),
          eq(schema.reservations.customerPhone, phone),
          inArray(schema.reservations.status, [...LOYALTY_COUNT_STATUSES]),
        ),
      )
      .groupBy(schema.reservations.customerPhone, schema.reservations.customerName)
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      customerPhone: row.customerPhone,
      customerName: row.customerName,
      visitCount: row.visitCount,
      firstVisit: row.firstVisit,
      lastVisit: row.lastVisit,
      isReturning: row.visitCount >= LOYALTY_RETURNING_THRESHOLD,
    };
  }

  /** Top clients d'un tenant (par nombre de visites décroissant). */
  async listTopCustomers(tenantId: string, limit = 20): Promise<CustomerStats[]> {
    const rows = await this.db
      .select({
        customerPhone: schema.reservations.customerPhone,
        customerName: sql<string>`max(${schema.reservations.customerName})`,
        visitCount: sql<number>`count(*)::int`,
        firstVisit: sql<string | null>`min(${schema.reservations.dateReservation})::text`,
        lastVisit: sql<string | null>`max(${schema.reservations.dateReservation})::text`,
      })
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.tenantId, tenantId),
          inArray(schema.reservations.status, [...LOYALTY_COUNT_STATUSES]),
        ),
      )
      .groupBy(schema.reservations.customerPhone)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    return rows.map((r) => ({
      customerPhone: r.customerPhone,
      customerName: r.customerName,
      visitCount: r.visitCount,
      firstVisit: r.firstVisit,
      lastVisit: r.lastVisit,
      isReturning: r.visitCount >= LOYALTY_RETURNING_THRESHOLD,
    }));
  }
}
