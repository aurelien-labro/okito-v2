import { logger } from "../lib/logger.js";
import { LoggingNotifier, type NotificationInput, type NotificationResult } from "./notifier.js";

export interface TwilioWhatsAppConfig {
  accountSid: string;
  authToken: string;
  /** Numéro WhatsApp Twilio (E.164 sans préfixe "whatsapp:"), ex: "+14155238886". */
  from: string;
  /** Endpoint Twilio — surchargeable pour les tests. */
  endpoint?: string;
}

/**
 * Notifier WhatsApp via Twilio.
 *
 * Choix Twilio (vs 360dialog) en phase MVP :
 *   - Sandbox WhatsApp gratuit (testable en 30 sec sans compte Meta Business)
 *   - 1 seul provider pour SMS + WhatsApp si on rajoute SMS plus tard
 *   - Markup conversation ~30-50% > prix Meta brut → swap 360dialog quand le
 *     volume dépasse ~1000-2000 msg/mois (économies justifient le setup BSP)
 *
 * Hérite de LoggingNotifier pour réutiliser la composition multi-canal
 * (`notifyReservationCreated`, etc.) en interceptant uniquement le canal
 * whatsapp. Email / SMS retombent sur le log.
 */
export class TwilioWhatsAppNotifier extends LoggingNotifier {
  private readonly endpoint: string;

  constructor(private readonly config: TwilioWhatsAppConfig) {
    super();
    this.endpoint =
      config.endpoint ??
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  }

  override async send(input: NotificationInput): Promise<NotificationResult> {
    if (input.channel !== "whatsapp") {
      return super.send(input);
    }
    if (!input.to.startsWith("+")) {
      logger.warn({ to: input.to }, "TwilioWhatsAppNotifier: téléphone non-E.164");
      return { delivered: false, provider: "twilio", error: "invalid phone" };
    }
    try {
      const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString(
        "base64",
      );
      const body = new URLSearchParams({
        From: `whatsapp:${this.config.from}`,
        To: `whatsapp:${input.to}`,
        Body: input.body,
      });
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      if (!res.ok) {
        const errBody = await safeText(res);
        logger.error(
          { status: res.status, body: errBody, context: input.context },
          "TwilioWhatsAppNotifier: envoi échoué",
        );
        return { delivered: false, provider: "twilio", error: `HTTP ${res.status}` };
      }
      const json = (await res.json().catch(() => ({}))) as { sid?: string };
      return { delivered: true, provider: "twilio", externalId: json.sid };
    } catch (err) {
      logger.error({ err, context: input.context }, "TwilioWhatsAppNotifier: exception réseau");
      return {
        delivered: false,
        provider: "twilio",
        error: err instanceof Error ? err.message : "unknown",
      };
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
