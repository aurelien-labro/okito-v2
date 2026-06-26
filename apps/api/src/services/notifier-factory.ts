import type { Env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { LoggingNotifier, type Notifier } from "./notifier.js";
import { ResendNotifier } from "./resend-notifier.js";

/**
 * Choisit l'implémentation Notifier selon les variables d'environnement.
 * - RESEND_API_KEY + RESEND_FROM_EMAIL présents → ResendNotifier (email réel)
 * - sinon → LoggingNotifier (placeholder dev)
 *
 * WhatsApp / SMS : toujours logger pour l'instant (360dialog / Twilio = Phase 3).
 */
export function createNotifier(env: Env): Notifier {
  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    logger.info({ from: env.RESEND_FROM_EMAIL }, "Notifier: Resend activé pour les emails");
    return new ResendNotifier({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
    });
  }
  logger.warn(
    "Notifier: RESEND_API_KEY/RESEND_FROM_EMAIL absents — fallback LoggingNotifier (emails non envoyés)",
  );
  return new LoggingNotifier();
}
