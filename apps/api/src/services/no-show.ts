import { type Database, schema } from "@okito/db";
import { and, eq, lt } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { AuditLogService } from "./audit-log.js";
import type { BusinessEventEmitter } from "./event-bus.js";

export interface NoShowRunResult {
  tenantsProcessed: number;
  marked: number;
}

/**
 * Marque automatiquement en `no_show` les réservations confirmées dont le
 * créneau est passé depuis plus que le délai de grâce, sans passage manuel.
 *
 * Le délai de grâce évite de flag une résa "confirmed" encore en cours de
 * service (le client peut arriver en retard). Chaque bascule est auditée.
 *
 * Calcul du "maintenant local tenant" : on compare des chaînes date+heure
 * dans le fuseau du tenant, cohérent avec le stockage (date_reservation +
 * heure en local, sans offset).
 */
/** Borne le nombre de résas traitées par run/tenant : un backlog est rattrapé sur plusieurs runs horaires. */
const MAX_PER_RUN = 500;

export class NoShowService {
  constructor(
    private readonly db: Database,
    private readonly audit?: AuditLogService,
    private readonly graceMinutes = 120,
    private readonly webhooks?: BusinessEventEmitter,
  ) {}

  async markStale(opts?: { dryRun?: boolean }): Promise<NoShowRunResult> {
    const dryRun = opts?.dryRun ?? false;
    const result: NoShowRunResult = { tenantsProcessed: 0, marked: 0 };

    const tenants = await this.db.query.tenants.findMany({
      columns: { id: true, timezone: true },
    });

    for (const tenant of tenants) {
      result.tenantsProcessed++;
      const cutoff = cutoffInTimezone(tenant.timezone, this.graceMinutes);

      // Candidats : confirmées, dont la date est <= aujourd'hui (borne large en SQL),
      // filtre fin en JS sur date+heure < cutoff (le créneau exact est passé).
      const candidates = await this.db
        .select()
        .from(schema.reservations)
        .where(
          and(
            eq(schema.reservations.tenantId, tenant.id),
            eq(schema.reservations.status, "confirmed"),
            lt(schema.reservations.dateReservation, cutoff.dateIso),
          ),
        )
        .limit(MAX_PER_RUN);

      // Le jour du cutoff lui-même : comparer l'heure.
      const sameDay = await this.db
        .select()
        .from(schema.reservations)
        .where(
          and(
            eq(schema.reservations.tenantId, tenant.id),
            eq(schema.reservations.status, "confirmed"),
            eq(schema.reservations.dateReservation, cutoff.dateIso),
          ),
        )
        .limit(MAX_PER_RUN);
      const stale = [...candidates, ...sameDay.filter((r) => r.heure.slice(0, 5) < cutoff.timeHm)];

      for (const r of stale) {
        if (dryRun) {
          result.marked++;
          continue;
        }
        const [updated] = await this.db
          .update(schema.reservations)
          .set({ status: "no_show", updatedAt: new Date() })
          .where(and(eq(schema.reservations.id, r.id), eq(schema.reservations.status, "confirmed")))
          .returning();
        if (!updated) continue;
        result.marked++;
        this.webhooks?.emit(tenant.id, "reservation.no_show", {
          id: updated.id,
          dateReservation: updated.dateReservation,
          heure: updated.heure,
          couverts: updated.couverts,
          customerName: updated.customerName,
          customerPhone: updated.customerPhone,
          status: updated.status,
        });
        if (this.audit) {
          await this.audit
            .log({
              action: "reservation.no_show_auto",
              entityType: "reservation",
              entityId: r.id,
              tenantId: tenant.id,
              actorLabel: "system:no-show-cron",
              before: { status: "confirmed" },
              after: { status: "no_show" },
            })
            .catch((err) => logger.error({ err, reservationId: r.id }, "no_show audit failed"));
        }
      }
    }

    logger.info({ result, dryRun }, "NoShowService.markStale done");
    return result;
  }
}

/** Date+heure locale tenant, décalées de `graceMinutes` dans le passé. */
function cutoffInTimezone(
  timezone: string,
  graceMinutes: number,
): { dateIso: string; timeHm: string } {
  const cutoff = new Date(Date.now() - graceMinutes * 60_000);
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(cutoff).map((p) => [p.type, p.value]));
  return {
    dateIso: `${parts.year}-${parts.month}-${parts.day}`,
    timeHm: `${parts.hour}:${parts.minute}`,
  };
}
