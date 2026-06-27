import type { Database } from "@okito/db";
import { Hono } from "hono";
import type { Env } from "./lib/env.js";
import { HttpError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { captureException } from "./lib/sentry.js";
import type { AppEnv } from "./lib/types.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { adminRemindersRoute } from "./routes/admin-reminders.js";
import { chatRoute } from "./routes/chat.js";
import { healthRoute } from "./routes/health.js";
import { inngestRoute } from "./routes/inngest.js";
import { playgroundRoute } from "./routes/playground.js";
import { reservationsRoute } from "./routes/reservations.js";
import { vapiLlmRoute } from "./routes/vapi-llm.js";
import { whatsappWebhookRoute } from "./routes/whatsapp-webhook.js";
import type { ChatService } from "./services/chat.js";
import type { ReminderService } from "./services/reminder.js";
import type { ReservationService } from "./services/reservation.js";

export interface AppServices {
  reservation?: ReservationService;
  chat?: ChatService;
  /** Si fourni, /health ping la DB. Sinon /health remonte db.status="not_configured". */
  db?: Database;
  /** Tenant pré-rempli dans la page de playground (dev). */
  defaultTenantId?: string;
  /** Clé publique Vapi pour le SDK Web (sûre côté client). */
  vapiPublicKey?: string;
  /** ID assistant Vapi à appeler depuis le widget vocal. */
  vapiAssistantId?: string;
  /** Service de rappels J-1, monté sur /v1/admin/reminders en dev. */
  reminder?: ReminderService;
}

export function createApp(env: Env, services: AppServices = {}) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    return c.json({ error: { code: "internal_error", message: "Erreur serveur" } }, 500);
  });

  app.route("/health", healthRoute(env, services.db));

  if (env.NODE_ENV !== "production") {
    app.route(
      "/",
      playgroundRoute({
        defaultTenantId: services.defaultTenantId,
        vapiPublicKey: services.vapiPublicKey,
        vapiAssistantId: services.vapiAssistantId,
      }),
    );
  }

  if (services.reservation || services.chat) {
    const v1 = new Hono<AppEnv>();
    v1.use("*", createAuthMiddleware(env));
    if (services.reservation) v1.route("/reservations", reservationsRoute(services.reservation));
    if (services.chat) v1.route("/chat", chatRoute(services.chat));
    app.route("/v1", v1);
  }

  // Vapi custom LLM webhook — non-auth (Vapi n'envoie pas de JWT Supabase).
  // En prod, ajouter un middleware qui vérifie un X-Vapi-Secret partagé avec l'assistant.
  if (services.chat) {
    app.route("/vapi/llm", vapiLlmRoute(services.chat));
  }

  // Webhook WhatsApp inbound (Twilio + 360dialog).
  // En prod, activer TWILIO_VALIDATE_WEBHOOK=true pour exiger X-Twilio-Signature.
  if (services.chat && services.db) {
    const twilioAuthToken =
      env.TWILIO_VALIDATE_WEBHOOK === "true" ? env.TWILIO_AUTH_TOKEN : undefined;
    app.route(
      "/v1/webhooks/whatsapp",
      whatsappWebhookRoute({
        chat: services.chat,
        db: services.db,
        twilioAuthToken,
      }),
    );
  }

  // Endpoint admin pour trigger les rappels J-1 manuellement (dev).
  if (services.reminder && env.NODE_ENV !== "production") {
    app.route("/admin/reminders", adminRemindersRoute(services.reminder));
  }

  // Inngest : endpoint scrape par le dashboard pour découvrir + invoquer
  // les functions (cron rappels J-1, future events).
  if (services.reminder) {
    app.route("/api/inngest", inngestRoute(services.reminder));
  }

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Route inconnue" } }, 404));

  return app;
}
