import type { Database } from "@okito/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./lib/env.js";
import { HttpError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { captureException } from "./lib/sentry.js";
import type { AppEnv } from "./lib/types.js";
import { createAdminMiddleware } from "./middleware/admin.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { adminAuditRoute } from "./routes/admin-audit.js";
import { adminRemindersRoute } from "./routes/admin-reminders.js";
import { adminTenantsRoute } from "./routes/admin-tenants.js";
import { chatRoute } from "./routes/chat.js";
import { healthRoute } from "./routes/health.js";
import { inngestRoute } from "./routes/inngest.js";
import { metricsRoute } from "./routes/metrics.js";
import { playgroundRoute } from "./routes/playground.js";
import { reservationsRoute } from "./routes/reservations.js";
import { stripeWebhookRoute } from "./routes/stripe-webhook.js";
import { vapiLlmRoute } from "./routes/vapi-llm.js";
import { whatsappWebhookRoute } from "./routes/whatsapp-webhook.js";
import { widgetRoute } from "./routes/widget.js";
import type { AuditLogService } from "./services/audit-log.js";
import type { ChatService } from "./services/chat.js";
import type { ReminderService } from "./services/reminder.js";
import type { ReservationService } from "./services/reservation.js";
import type { SubscriptionService } from "./services/subscription.js";
import type { TenantService } from "./services/tenant.js";

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
  /** Service de gestion tenants, monté sur /v1/admin/tenants si ADMIN_USER_IDS configuré. */
  tenant?: TenantService;
  /** Service de journal d'audit, monté sur /v1/admin/audit si fourni. */
  audit?: AuditLogService;
  /** Service abonnements Stripe — monte /v1/webhooks/stripe si STRIPE_WEBHOOK_SECRET set. */
  subscription?: SubscriptionService;
}

export function createApp(env: Env, services: AppServices = {}) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    return c.json({ error: { code: "internal_error", message: "Erreur serveur" } }, 500);
  });

  // CORS : autorise le dashboard (APP_URL) à appeler l'API depuis le navigateur.
  // En prod, APP_URL pointe sur le domaine du dashboard ; en dev, localhost:3000.
  // Le widget JS embarquable (/v1/widget/*) reste ouvert (origin: *) car il
  // doit fonctionner sur n'importe quel site client.
  app.use(
    "/v1/widget/*",
    cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], maxAge: 86400 }),
  );
  app.use(
    "*",
    cors({
      origin: [env.APP_URL, "http://localhost:3000"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Tenant-Id"],
      credentials: true,
      maxAge: 86400,
    }),
  );

  // Métriques Prometheus : middleware sur tout sauf /metrics (on ne se mesure pas soi-même).
  app.use("*", async (c, next) => {
    if (c.req.path === "/metrics") return next();
    return metricsMiddleware(c, next);
  });

  app.route("/metrics", metricsRoute());
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

  // Widget JS embarquable — endpoint public CORS-permissif (à durcir avec
  // whitelist d'origines par tenant en prod).
  // tenantService fourni → route /config/:tenantId active (branding public).
  if (services.chat) {
    app.route("/v1/widget", widgetRoute(services.chat, services.tenant));
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

  // CRUD admin tenants — JWT requis + whitelist ADMIN_USER_IDS.
  if (services.tenant && env.ADMIN_USER_IDS) {
    const adminIds = env.ADMIN_USER_IDS.split(",");
    const v1Admin = new Hono<AppEnv>();
    v1Admin.use("*", createAuthMiddleware(env));
    v1Admin.use("*", createAdminMiddleware(adminIds));
    v1Admin.route("/tenants", adminTenantsRoute(services.tenant, services.audit));
    if (services.audit) {
      v1Admin.route("/audit", adminAuditRoute(services.audit));
    }
    app.route("/v1/admin", v1Admin);
  }

  // Inngest : endpoint scrape par le dashboard pour découvrir + invoquer
  // les functions (cron rappels J-1, future events).
  if (services.reminder) {
    app.route("/api/inngest", inngestRoute(services.reminder));
  }

  // Webhook Stripe — signature vérifiée via STRIPE_WEBHOOK_SECRET.
  // Source de vérité = Stripe ; on cache localement le status pour
  // pouvoir filtrer les features sans round-trip.
  if (services.subscription && env.STRIPE_WEBHOOK_SECRET) {
    app.route(
      "/v1/webhooks/stripe",
      stripeWebhookRoute({
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        subscription: services.subscription,
      }),
    );
  }

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Route inconnue" } }, 404));

  return app;
}
