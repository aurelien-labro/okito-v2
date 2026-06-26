import type { Reservation, Tenant } from "@okito/db";
import { logger } from "../lib/logger.js";

export type NotificationChannel = "whatsapp" | "email" | "sms";

export interface NotificationInput {
  tenantId: string;
  channel: NotificationChannel;
  /** Destinataire — téléphone E.164 ou email selon le canal. */
  to: string;
  subject?: string;
  body: string;
  /** Pour traçabilité (résa concernée, type de notif). */
  context?: Record<string, unknown>;
}

export interface NotificationResult {
  delivered: boolean;
  provider: string;
  externalId?: string;
  error?: string;
}

/**
 * Contract minimal d'un notifier. Implémentations possibles :
 * - LoggingNotifier (dev, log seulement) — branchée par défaut
 * - WhatsAppNotifier (360dialog ou Twilio Business) — Phase 3
 * - EmailNotifier (Resend ou Postmark) — Phase 3
 */
export interface Notifier {
  send(input: NotificationInput): Promise<NotificationResult>;
  /**
   * Diffuse les notifs après une résa créée :
   * - WhatsApp client (confirmation)
   * - WhatsApp + Email manager (récap interne)
   */
  notifyReservationCreated(tenant: Tenant, reservation: Reservation): Promise<void>;
  notifyReservationCancelled(tenant: Tenant, reservation: Reservation): Promise<void>;
}

/**
 * Notifier dev — log seulement, n'envoie rien. Sert de placeholder tant que
 * 360dialog/Resend/Twilio ne sont pas connectés. Les messages produits ici
 * sont strictement ceux qu'on enverrait en prod, donc on peut valider le
 * contenu avant d'avoir les creds.
 */
export class LoggingNotifier implements Notifier {
  async send(input: NotificationInput): Promise<NotificationResult> {
    logger.info(
      {
        notifier: "logging",
        channel: input.channel,
        to: maskRecipient(input.to),
        context: input.context,
      },
      `[notif → ${input.channel}] ${input.subject ? `${input.subject} — ` : ""}${input.body}`,
    );
    return { delivered: true, provider: "logging" };
  }

  async notifyReservationCreated(tenant: Tenant, r: Reservation): Promise<void> {
    const date = formatDateHuman(r.dateReservation);
    const time = r.heure.slice(0, 5);

    const clientMsg = `Bonjour ${firstName(r.customerName)}, on confirme votre réservation chez ${tenant.name} ${date} à ${time} pour ${r.couverts} personne${r.couverts > 1 ? "s" : ""}. À très vite !`;

    const notesLine = r.notes ? `\n• Notes : ${r.notes}` : "";
    const managerMsg = `Nouvelle réservation chez ${tenant.name} :\n• ${r.customerName} (${r.customerPhone})\n• ${date} à ${time} — ${r.couverts} couverts\n• Source : ${r.source}${notesLine}`;

    await Promise.all([
      r.customerPhone
        ? this.send({
            tenantId: tenant.id,
            channel: "whatsapp",
            to: r.customerPhone,
            body: clientMsg,
            context: { type: "reservation_created_client", reservationId: r.id },
          })
        : Promise.resolve({ delivered: false, provider: "logging", error: "no phone" }),
      tenant.contactEmail
        ? this.send({
            tenantId: tenant.id,
            channel: "email",
            to: tenant.contactEmail,
            subject: `Nouvelle résa — ${r.customerName} le ${date} à ${time}`,
            body: managerMsg,
            context: { type: "reservation_created_manager", reservationId: r.id },
          })
        : Promise.resolve({ delivered: false, provider: "logging", error: "no manager email" }),
      tenant.contactPhone
        ? this.send({
            tenantId: tenant.id,
            channel: "whatsapp",
            to: tenant.contactPhone,
            body: managerMsg,
            context: { type: "reservation_created_manager_wa", reservationId: r.id },
          })
        : Promise.resolve({ delivered: false, provider: "logging", error: "no manager phone" }),
    ]);
  }

  async notifyReservationCancelled(tenant: Tenant, r: Reservation): Promise<void> {
    const date = formatDateHuman(r.dateReservation);
    const time = r.heure.slice(0, 5);
    const clientMsg = `Votre réservation chez ${tenant.name} ${date} à ${time} a bien été annulée. À bientôt !`;
    const managerMsg = `Annulation : ${r.customerName} (${r.customerPhone}) — ${date} à ${time}, ${r.couverts} couverts.`;

    await Promise.all([
      r.customerPhone
        ? this.send({
            tenantId: tenant.id,
            channel: "whatsapp",
            to: r.customerPhone,
            body: clientMsg,
            context: { type: "reservation_cancelled_client", reservationId: r.id },
          })
        : Promise.resolve({ delivered: false, provider: "logging", error: "no phone" }),
      tenant.contactEmail
        ? this.send({
            tenantId: tenant.id,
            channel: "email",
            to: tenant.contactEmail,
            subject: `Annulation — ${r.customerName} ${date} à ${time}`,
            body: managerMsg,
            context: { type: "reservation_cancelled_manager", reservationId: r.id },
          })
        : Promise.resolve({ delivered: false, provider: "logging", error: "no manager email" }),
    ]);
  }
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function formatDateHuman(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `le ${d}/${m}/${y}`;
}

function maskRecipient(to: string): string {
  if (to.includes("@")) {
    const [user, domain] = to.split("@");
    return `${(user ?? "").slice(0, 2)}***@${domain ?? ""}`;
  }
  return to.length > 4 ? `${to.slice(0, 3)}...${to.slice(-2)}` : "***";
}
