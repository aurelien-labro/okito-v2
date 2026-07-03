import type { Env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { CompositeNotifier } from "./composite-notifier.js";
import { LoggingNotifier, type NotificationChannel, type Notifier } from "./notifier.js";
import { PolicyAwareNotifier } from "./policy-aware-notifier.js";
import { ResendNotifier } from "./resend-notifier.js";
import { Three60DialogNotifier } from "./three60-dialog-notifier.js";
import { TwilioSmsNotifier } from "./twilio-sms-notifier.js";
import { TwilioWhatsAppNotifier } from "./twilio-whatsapp-notifier.js";

/**
 * Choisit l'implémentation Notifier selon les variables d'environnement.
 *
 * Chaque provider est mappé à un canal :
 *   - RESEND_API_KEY + RESEND_FROM_EMAIL → Resend pour `email`
 *   - THREE60DIALOG_API_KEY → 360dialog pour `whatsapp` (prioritaire sur Twilio)
 *   - TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM → Twilio pour `whatsapp`
 *   - TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_SMS_FROM → Twilio pour `sms`
 *
 * Si plusieurs canaux configurés → CompositeNotifier qui route.
 * Si un seul → on retourne le notifier directement (perf, lisibilité).
 * Si zéro → LoggingNotifier (placeholder dev).
 */
export function createNotifier(env: Env): Notifier {
  const byChannel: Partial<Record<NotificationChannel, Notifier>> = {};

  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    logger.info({ from: env.RESEND_FROM_EMAIL }, "Notifier: Resend activé pour email");
    byChannel.email = new ResendNotifier({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
    });
  }

  if (env.THREE60DIALOG_API_KEY) {
    logger.info("Notifier: 360dialog activé pour WhatsApp (prioritaire sur Twilio)");
    byChannel.whatsapp = new Three60DialogNotifier({ apiKey: env.THREE60DIALOG_API_KEY });
  } else if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM) {
    logger.info({ from: env.TWILIO_WHATSAPP_FROM }, "Notifier: Twilio activé pour WhatsApp");
    byChannel.whatsapp = new TwilioWhatsAppNotifier({
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      from: env.TWILIO_WHATSAPP_FROM,
    });
  }

  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_SMS_FROM) {
    logger.info({ from: env.TWILIO_SMS_FROM }, "Notifier: Twilio activé pour SMS");
    byChannel.sms = new TwilioSmsNotifier({
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      from: env.TWILIO_SMS_FROM,
    });
  }

  const configured = Object.keys(byChannel).length;
  const base: Notifier =
    configured === 0
      ? (() => {
          logger.warn(
            "Notifier: aucun provider configuré — fallback LoggingNotifier (rien n'est envoyé)",
          );
          return new LoggingNotifier();
        })()
      : new CompositeNotifier(byChannel);

  // Wrap dans PolicyAwareNotifier : avant chaque envoi reservation.created/cancelled,
  // consulte tenant.notificationPreferences et filtre destinataires + canaux.
  // Cette couche est transparente pour ChatService — elle appelle toujours
  // notifyReservationCreated/Cancelled, mais l'envoi réel respecte la policy.
  return new PolicyAwareNotifier(base, env.PORTAL_URL);
}
