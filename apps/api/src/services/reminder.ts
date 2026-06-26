import type { Database, Reservation, Tenant } from "@okito/db";
import { logger } from "../lib/logger.js";
import type { Notifier } from "./notifier.js";

export interface ReminderRunResult {
  tenantsProcessed: number;
  remindersSent: number;
  remindersSkipped: number;
  errors: number;
  details: Array<{
    tenantId: string;
    tenantSlug: string;
    targetDate: string;
    reservationCount: number;
    sent: number;
  }>;
}

/**
 * Service "rappels J-1" :
 * - Liste les tenants actifs avec remindersEnabled=true
 * - Pour chaque, calcule la date "demain" dans son fuseau
 * - Envoie un rappel WhatsApp à chaque résa confirmée pour demain
 *
 * Volontairement déclenché en dehors du process (endpoint admin ou Inngest).
 * Pas de cron in-process : risque de doublons si plusieurs instances API tournent.
 */
export class ReminderService {
  constructor(
    private readonly db: Database,
    private readonly notifier: Notifier,
  ) {}

  async runForTomorrow(opts?: { dryRun?: boolean }): Promise<ReminderRunResult> {
    const dryRun = opts?.dryRun ?? false;
    const result: ReminderRunResult = {
      tenantsProcessed: 0,
      remindersSent: 0,
      remindersSkipped: 0,
      errors: 0,
      details: [],
    };

    const activeTenants = await this.db.query.tenants.findMany({
      where: (t, { eq: e, and: a }) => a(e(t.status, "active"), e(t.remindersEnabled, true)),
    });

    for (const tenant of activeTenants) {
      result.tenantsProcessed++;
      const targetDate = tomorrowInTimezone(tenant.timezone);
      const resas = await this.db.query.reservations.findMany({
        where: (r, { eq: e, and: a }) =>
          a(e(r.tenantId, tenant.id), e(r.dateReservation, targetDate), e(r.status, "confirmed")),
      });

      const detail = {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        targetDate,
        reservationCount: resas.length,
        sent: 0,
      };

      for (const r of resas) {
        if (!r.customerPhone) {
          result.remindersSkipped++;
          continue;
        }
        if (dryRun) {
          result.remindersSent++;
          detail.sent++;
          continue;
        }
        try {
          await this.sendReminder(tenant, r);
          result.remindersSent++;
          detail.sent++;
        } catch (err) {
          result.errors++;
          logger.error({ err, reservationId: r.id }, "reminder send failed");
        }
      }

      result.details.push(detail);
    }

    logger.info({ result, dryRun }, "ReminderService.runForTomorrow done");
    return result;
  }

  private async sendReminder(tenant: Tenant, r: Reservation): Promise<void> {
    const time = r.heure.slice(0, 5);
    const body =
      `Bonjour ${firstName(r.customerName)}, petit rappel : votre réservation chez ${tenant.name} demain à ${time} ` +
      `pour ${r.couverts} personne${r.couverts > 1 ? "s" : ""}. À demain !`;
    await this.notifier.send({
      tenantId: tenant.id,
      channel: "whatsapp",
      to: r.customerPhone,
      body,
      context: { type: "reminder_j1", reservationId: r.id },
    });
  }
}

/** Date demain dans le fuseau du tenant (YYYY-MM-DD). */
function tomorrowInTimezone(timezone: string): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = fmt.format(now); // "26/06/2026"
  const [d, m, y] = today.split("/");
  if (!d || !m || !y) {
    const t = new Date(now.getTime() + 86_400_000);
    return t.toISOString().slice(0, 10);
  }
  const todayDate = new Date(`${y}-${m}-${d}T00:00:00`);
  const tomorrow = new Date(todayDate.getTime() + 86_400_000);
  const yT = tomorrow.getFullYear();
  const mT = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const dT = String(tomorrow.getDate()).padStart(2, "0");
  return `${yT}-${mT}-${dT}`;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
