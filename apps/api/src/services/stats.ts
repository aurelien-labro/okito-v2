import { type Database, schema } from "@okito/db";
import { and, eq, gte, sql } from "drizzle-orm";

/**
 * Agrégations business pour le dashboard manager.
 *
 * Toutes les requêtes filtrent par tenant_id pour respecter l'isolation.
 * Période par défaut = 30 jours glissants. Pour des fenêtres plus longues
 * (90j, 1an), penser à créer des materialized views côté Postgres.
 */

export interface StatsOverview {
  /** Période couverte. */
  range: { fromIso: string; toIso: string; days: number };
  /** Totaux sur la période. */
  totals: {
    reservations: number;
    confirmed: number;
    cancelled: number;
    noShow: number;
    completed: number;
    couvertsTotal: number;
    couvertsAvg: number;
  };
  /** Taux de no-show = no_show / (confirmed + no_show + completed) sur les résas passées. */
  noShowRate: number;
  /** Résas créées par jour (ordre chronologique). */
  byDay: Array<{ date: string; total: number; confirmed: number; cancelled: number }>;
  /** Réservations par canal d'entrée. */
  bySource: Array<{ source: string; count: number }>;
  /** Top 10 heures de réservation (HH:00). */
  byHour: Array<{ hour: string; count: number }>;
}

export class StatsService {
  constructor(private readonly db: Database) {}

  async overview(tenantId: string, days = 30): Promise<StatsOverview> {
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const fromIso = from.toISOString();
    const toIso = now.toISOString();

    const fromDate = fromIso.slice(0, 10);

    const baseWhere = and(
      eq(schema.reservations.tenantId, tenantId),
      gte(schema.reservations.dateReservation, fromDate),
    );

    // 1. Totaux + ventilation status + couverts en 1 query
    const totalsRow = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        confirmed: sql<number>`count(*) filter (where status = 'confirmed')::int`,
        cancelled: sql<number>`count(*) filter (where status = 'cancelled')::int`,
        noShow: sql<number>`count(*) filter (where status = 'no_show')::int`,
        completed: sql<number>`count(*) filter (where status = 'completed')::int`,
        couvertsTotal: sql<number>`coalesce(sum(couverts) filter (where status != 'cancelled'), 0)::int`,
      })
      .from(schema.reservations)
      .where(baseWhere);

    const totals = totalsRow[0] ?? {
      total: 0,
      confirmed: 0,
      cancelled: 0,
      noShow: 0,
      completed: 0,
      couvertsTotal: 0,
    };

    const nonCancelled = totals.confirmed + totals.noShow + totals.completed;
    const couvertsAvg = nonCancelled > 0 ? totals.couvertsTotal / nonCancelled : 0;
    const pastClosed = totals.noShow + totals.completed;
    const noShowRate = pastClosed > 0 ? totals.noShow / pastClosed : 0;

    // 2. Série temporelle par jour
    const byDayRows = await this.db
      .select({
        date: schema.reservations.dateReservation,
        total: sql<number>`count(*)::int`,
        confirmed: sql<number>`count(*) filter (where status = 'confirmed')::int`,
        cancelled: sql<number>`count(*) filter (where status = 'cancelled')::int`,
      })
      .from(schema.reservations)
      .where(baseWhere)
      .groupBy(schema.reservations.dateReservation)
      .orderBy(schema.reservations.dateReservation);

    // 3. Par source
    const bySourceRows = await this.db
      .select({
        source: schema.reservations.source,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.reservations)
      .where(baseWhere)
      .groupBy(schema.reservations.source)
      .orderBy(sql`count(*) desc`);

    // 4. Top heures (HH:00) — utilise un extract sur la colonne time
    const byHourRows = await this.db
      .select({
        hour: sql<string>`to_char(heure, 'HH24:MI')`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.reservations)
      .where(baseWhere)
      .groupBy(sql`heure`)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    return {
      range: { fromIso, toIso, days },
      totals: { ...totals, reservations: totals.total, couvertsAvg },
      noShowRate,
      byDay: byDayRows,
      bySource: bySourceRows,
      byHour: byHourRows,
    };
  }
}
