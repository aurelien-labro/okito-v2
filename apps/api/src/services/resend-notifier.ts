import { logger } from "../lib/logger.js";
import { LoggingNotifier, type NotificationInput, type NotificationResult } from "./notifier.js";

export interface ResendNotifierConfig {
  apiKey: string;
  /** Adresse expéditeur autorisée Resend (ex: "OKITO <bot@okito.app>"). */
  from: string;
  /** Endpoint Resend — surchargeable pour les tests. */
  endpoint?: string;
}

/**
 * Notifier hybride :
 *   - canal email  → Resend (https://resend.com/docs/api-reference/emails/send-email)
 *   - canal whatsapp / sms → fallback LoggingNotifier (hérité) en attendant
 *     360dialog / Twilio.
 *
 * Hérite de LoggingNotifier pour réutiliser la composition multi-canal de
 * notifyReservationCreated / notifyReservationCancelled — l'override de
 * `send()` est appelé en polymorphique depuis les méthodes héritées.
 */
export class ResendNotifier extends LoggingNotifier {
  private readonly endpoint: string;

  constructor(private readonly config: ResendNotifierConfig) {
    super();
    this.endpoint = config.endpoint ?? "https://api.resend.com/emails";
  }

  override async send(input: NotificationInput): Promise<NotificationResult> {
    if (input.channel !== "email") {
      return super.send(input);
    }
    if (!input.to.includes("@")) {
      logger.warn({ to: input.to }, "ResendNotifier: destinataire email invalide");
      return { delivered: false, provider: "resend", error: "invalid email" };
    }
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.config.from,
          to: input.to,
          subject: input.subject ?? "Notification OKITO",
          text: input.body,
        }),
      });
      if (!res.ok) {
        const body = await safeText(res);
        logger.error(
          { status: res.status, body, context: input.context },
          "ResendNotifier: envoi échoué",
        );
        return { delivered: false, provider: "resend", error: `HTTP ${res.status}` };
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return { delivered: true, provider: "resend", externalId: json.id };
    } catch (err) {
      logger.error({ err, context: input.context }, "ResendNotifier: exception réseau");
      return {
        delivered: false,
        provider: "resend",
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
