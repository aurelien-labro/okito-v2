import { type Database, schema } from "@okito/db";
import { and, eq, notExists } from "drizzle-orm";
import { signFeed } from "../lib/ical.js";
import { logger } from "../lib/logger.js";
import type { Notifier } from "./notifier.js";

export interface ReviewRequestResult {
  tenantsProcessed: number;
  sent: number;
}

/**
 * Envoie les demandes d'avis pour les réservations honorées d'hier.
 * Le lien est signé HMAC sur le reservationId (page landing /review/:id?sig=).
 */
export class ReviewRequestService {
  constructor(
    private readonly db: Database,
    private readonly notifier: Notifier,
    private readonly secret: string,
    private readonly portalBaseUrl: string,
  ) {}

  async runForYesterday(opts?: { dryRun?: boolean }): Promise<ReviewRequestResult> {
    const dryRun = opts?.dryRun ?? false;
    const result: ReviewRequestResult = { tenantsProcessed: 0, sent: 0 };

    const tenants = await this.db.query.tenants.findMany({ columns: { id: true, timezone: true } });

    for (const tenant of tenants) {
      result.tenantsProcessed++;
      const target = yesterdayInTimezone(tenant.timezone);
      // Honorées = confirmées passées (ni annulées ni no_show), sans avis déjà
      // reçu (idempotence : un re-run du cron ne re-sollicite pas les clients).
      const resas = await this.db
        .select()
        .from(schema.reservations)
        .where(
          and(
            eq(schema.reservations.tenantId, tenant.id),
            eq(schema.reservations.dateReservation, target),
            eq(schema.reservations.status, "confirmed"),
            notExists(
              this.db
                .select({ one: schema.reservationReviews.id })
                .from(schema.reservationReviews)
                .where(eq(schema.reservationReviews.reservationId, schema.reservations.id)),
            ),
          ),
        );

      for (const r of resas) {
        if (!r.customerPhone) continue;
        if (dryRun) {
          result.sent++;
          continue;
        }
        const sig = signFeed(r.id, this.secret);
        const url = `${this.portalBaseUrl.replace(/\/$/, "")}/review/${r.id}?sig=${sig}`;
        const firstName = r.customerName.trim().split(/\s+/)[0] ?? r.customerName;
        try {
          await this.notifier.send({
            tenantId: tenant.id,
            channel: "whatsapp",
            to: r.customerPhone,
            body: `Bonjour ${firstName}, merci de votre visite ! Comment ça s'est passé ? Votre avis en 10 secondes : ${url}`,
            context: { type: "review_request", reservationId: r.id },
          });
          result.sent++;
        } catch (err) {
          logger.error({ err, reservationId: r.id }, "review request send failed");
        }
      }
    }

    logger.info({ result, dryRun }, "ReviewRequestService.runForYesterday done");
    return result;
  }
}

function yesterdayInTimezone(timezone: string): string {
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(Date.now() - 86_400_000)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
