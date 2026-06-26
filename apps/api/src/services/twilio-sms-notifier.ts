import { logger } from "../lib/logger.js";
import { LoggingNotifier, type NotificationInput, type NotificationResult } from "./notifier.js";

export interface TwilioSmsConfig {
  accountSid: string;
  authToken: string;
  /** Numéro SMS Twilio en E.164, ex: "+33756123456". */
  from: string;
  /** Endpoint Twilio — surchargeable pour les tests. */
  endpoint?: string;
}

/**
 * Notifier SMS via Twilio.
 *
 * Cas d'usage : fallback quand WhatsApp ne livre pas (numéro pas sur WA,
 * destinataire qui n'utilise pas l'app, etc.), ou pour les rappels J-1
 * dans les pays où le SMS reste la norme (FR rural notamment).
 *
 * Même API Twilio que `TwilioWhatsAppNotifier` mais SANS le préfixe
 * `whatsapp:` sur From/To. Numéro SMS séparé : un compte Twilio peut avoir
 * un numéro WhatsApp Business + un numéro SMS classique.
 */
export class TwilioSmsNotifier extends LoggingNotifier {
  private readonly endpoint: string;

  constructor(private readonly config: TwilioSmsConfig) {
    super();
    this.endpoint =
      config.endpoint ??
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  }

  override async send(input: NotificationInput): Promise<NotificationResult> {
    if (input.channel !== "sms") {
      return super.send(input);
    }
    if (!input.to.startsWith("+")) {
      logger.warn({ to: input.to }, "TwilioSmsNotifier: téléphone non-E.164");
      return { delivered: false, provider: "twilio", error: "invalid phone" };
    }
    try {
      const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString(
        "base64",
      );
      const body = new URLSearchParams({
        From: this.config.from,
        To: input.to,
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
          "TwilioSmsNotifier: envoi échoué",
        );
        return { delivered: false, provider: "twilio", error: `HTTP ${res.status}` };
      }
      const json = (await res.json().catch(() => ({}))) as { sid?: string };
      return { delivered: true, provider: "twilio", externalId: json.sid };
    } catch (err) {
      logger.error({ err, context: input.context }, "TwilioSmsNotifier: exception réseau");
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
