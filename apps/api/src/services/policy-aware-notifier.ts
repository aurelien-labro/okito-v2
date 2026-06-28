import type { Reservation, Tenant } from "@okito/db";
import { logger } from "../lib/logger.js";
import { type Audience, type Channel, recipientsFor } from "./notification-policy.js";
import type { NotificationInput, NotificationResult, Notifier } from "./notifier.js";

/**
 * Décorateur qui consulte tenant.notificationPreferences avant chaque envoi.
 * Wrap n'importe quel Notifier existant (LoggingNotifier, CompositeNotifier,
 * etc.) et filtre les destinataires/canaux selon les préférences du tenant.
 *
 * Si le tenant n'a pas de préférences définies → silencieux par défaut
 * (cohérent avec notification-policy : on ne suppose pas).
 *
 * Le contact info est résolu depuis :
 *   - manager → tenant.contactEmail (email) / tenant.contactPhone (whatsapp, sms)
 *   - client  → reservation.customerEmail / reservation.customerPhone
 *
 * Un destinataire manquant (ex: pas d'email manager configuré) est SILENCIEUSEMENT
 * skippé — pas d'erreur. La policy dit "j'aimerais envoyer", l'implémentation
 * envoie seulement si elle peut.
 */
export class PolicyAwareNotifier implements Notifier {
  constructor(private readonly base: Notifier) {}

  send(input: NotificationInput): Promise<NotificationResult> {
    return this.base.send(input);
  }

  async notifyReservationCreated(tenant: Tenant, r: Reservation): Promise<void> {
    await this.dispatch(tenant, r, "reservation.created");
  }

  async notifyReservationCancelled(tenant: Tenant, r: Reservation): Promise<void> {
    await this.dispatch(tenant, r, "reservation.cancelled");
  }

  private async dispatch(
    tenant: Tenant,
    r: Reservation,
    event: "reservation.created" | "reservation.cancelled",
  ): Promise<void> {
    const recipients = recipientsFor(tenant, event);
    if (recipients.length === 0) {
      logger.info(
        { tenantId: tenant.id, event, reservationId: r.id },
        "PolicyAwareNotifier: aucun destinataire — policy vide",
      );
      return;
    }

    const messages = buildMessages(tenant, r, event);

    const sends: Promise<unknown>[] = [];
    for (const { audience, channels } of recipients) {
      const msg = messages[audience];
      if (!msg) continue;
      for (const channel of channels) {
        const to = resolveRecipient(tenant, r, audience, channel);
        if (!to) {
          logger.warn(
            { tenantId: tenant.id, event, audience, channel, reservationId: r.id },
            "PolicyAwareNotifier: destinataire absent (contact non configuré)",
          );
          continue;
        }
        sends.push(
          this.base.send({
            tenantId: tenant.id,
            channel,
            to,
            subject: channel === "email" ? msg.subject : undefined,
            body: msg.body,
            context: { type: event, audience, reservationId: r.id },
          }),
        );
      }
    }
    await Promise.all(sends);
  }
}

interface BuiltMessage {
  subject: string;
  body: string;
}

function buildMessages(
  tenant: Tenant,
  r: Reservation,
  event: "reservation.created" | "reservation.cancelled",
): Record<Audience, BuiltMessage> {
  const date = formatDateHuman(r.dateReservation);
  const time = r.heure.slice(0, 5);
  const couvertsLabel = `${r.couverts} personne${r.couverts > 1 ? "s" : ""}`;

  if (event === "reservation.created") {
    return {
      client: {
        subject: `Confirmation de réservation — ${tenant.name}`,
        body: `Bonjour ${firstName(r.customerName)}, on confirme votre réservation chez ${tenant.name} ${date} à ${time} pour ${couvertsLabel}. À très vite !`,
      },
      manager: {
        subject: `Nouvelle résa — ${r.customerName} le ${date} à ${time}`,
        body: `Nouvelle réservation chez ${tenant.name} :\n• ${r.customerName} (${r.customerPhone})\n• ${date} à ${time} — ${couvertsLabel}\n• Source : ${r.source}${r.notes ? `\n• Notes : ${r.notes}` : ""}`,
      },
    };
  }
  return {
    client: {
      subject: `Annulation — ${tenant.name}`,
      body: `Votre réservation chez ${tenant.name} ${date} à ${time} a bien été annulée. À bientôt !`,
    },
    manager: {
      subject: `Annulation — ${r.customerName} ${date} à ${time}`,
      body: `Annulation : ${r.customerName} (${r.customerPhone}) — ${date} à ${time}, ${couvertsLabel}.`,
    },
  };
}

function resolveRecipient(
  tenant: Tenant,
  r: Reservation,
  audience: Audience,
  channel: Channel,
): string | null {
  if (audience === "manager") {
    if (channel === "email") return tenant.contactEmail || null;
    return tenant.contactPhone || null;
  }
  if (channel === "email") return r.customerEmail || null;
  return r.customerPhone || null;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function formatDateHuman(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `le ${d}/${m}/${y}`;
}
