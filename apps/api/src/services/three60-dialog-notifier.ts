import { logger } from "../lib/logger.js";
import { LoggingNotifier, type NotificationInput, type NotificationResult } from "./notifier.js";

export interface Three60DialogConfig {
  /** API key 360dialog (Hub > Settings > API Key, format `D3-...`). */
  apiKey: string;
  /**
   * Endpoint Cloud API v2 (par défaut). 360dialog héberge l'API Cloud Meta —
   * le path reste identique à l'API officielle WhatsApp Business.
   * Surchargeable pour les tests.
   */
  endpoint?: string;
}

/**
 * Notifier WhatsApp via 360dialog (BSP officiel Meta).
 *
 * À activer quand un tenant dépasse ~1000-2000 msg/mois — économies de
 * 30-40% vs le markup conversation Twilio. Le setup BSP (vérif Meta
 * Business + bandeau template approval) prend ~3-5 jours, donc on garde
 * Twilio comme défaut en phase MVP.
 *
 * Sémantiquement équivalent à [[TwilioWhatsAppNotifier]] : même contrat
 * `send()`, même fallback log pour les canaux non-WhatsApp. Swap dans la
 * factory = 1 ligne : `byChannel.whatsapp = new Three60DialogNotifier(...)`.
 *
 * Format payload : Cloud API officielle Meta v18+.
 * Doc : https://docs.360dialog.com/api/whatsapp-api/messages
 */
export class Three60DialogNotifier extends LoggingNotifier {
  private readonly endpoint: string;

  constructor(private readonly config: Three60DialogConfig) {
    super();
    this.endpoint = config.endpoint ?? "https://waba-v2.360dialog.io/messages";
  }

  override async send(input: NotificationInput): Promise<NotificationResult> {
    if (input.channel !== "whatsapp") {
      return super.send(input);
    }
    if (!input.to.startsWith("+")) {
      logger.warn({ to: input.to }, "Three60DialogNotifier: téléphone non-E.164");
      return { delivered: false, provider: "360dialog", error: "invalid phone" };
    }
    // L'API 360dialog/Meta veut le numéro sans le '+' ni espaces.
    const recipient = input.to.replace(/[^0-9]/g, "");
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: { body: input.body, preview_url: false },
    };
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "D360-API-KEY": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = await safeText(res);
        logger.error(
          { status: res.status, body: errBody, context: input.context },
          "Three60DialogNotifier: envoi échoué",
        );
        return { delivered: false, provider: "360dialog", error: `HTTP ${res.status}` };
      }
      const json = (await res.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
      };
      const externalId = json.messages?.[0]?.id;
      return { delivered: true, provider: "360dialog", externalId };
    } catch (err) {
      logger.error({ err, context: input.context }, "Three60DialogNotifier: exception réseau");
      return {
        delivered: false,
        provider: "360dialog",
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
