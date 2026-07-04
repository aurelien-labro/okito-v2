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
import { adminCustomersRoute } from "./routes/admin-customers.js";
import { adminIcalRoute } from "./routes/admin-ical.js";
import { adminJarvisActionsRoute } from "./routes/admin-jarvis-actions.js";
import { adminJarvisBriefRoute } from "./routes/admin-jarvis-brief.js";
import { adminLoyaltyRoute } from "./routes/admin-loyalty.js";
import { adminMailboxesRoute, googleOAuthCallbackRoute } from "./routes/admin-mailboxes.js";
import { adminMembersRoute } from "./routes/admin-members.js";
import { adminRemindersRoute } from "./routes/admin-reminders.js";
import { adminReviewsRoute } from "./routes/admin-reviews.js";
import { adminScheduleRulesRoute } from "./routes/admin-schedule-rules.js";
import { adminServiceCatalogRoute } from "./routes/admin-service-catalog.js";
import { adminStatsRoute } from "./routes/admin-stats.js";
import { adminTablesRoute } from "./routes/admin-tables.js";
import { adminTenantsRoute } from "./routes/admin-tenants.js";
import { adminWaitlistRoute } from "./routes/admin-waitlist.js";
import { adminWebhooksRoute } from "./routes/admin-webhooks.js";
import { chatRoute } from "./routes/chat.js";
import { healthRoute } from "./routes/health.js";
import { icalFeedRoute } from "./routes/ical-feed.js";
import { inngestRoute } from "./routes/inngest.js";
import { metricsRoute } from "./routes/metrics.js";
import { playgroundRoute } from "./routes/playground.js";
import { portalRoute } from "./routes/portal.js";
import { reservationsRoute } from "./routes/reservations.js";
import { reviewRoute } from "./routes/review.js";
import { stripeWebhookRoute } from "./routes/stripe-webhook.js";
import { vapiLlmRoute } from "./routes/vapi-llm.js";
import { whatsappWebhookRoute } from "./routes/whatsapp-webhook.js";
import { widgetRoute } from "./routes/widget.js";
import type { AuditLogService } from "./services/audit-log.js";
import type { CapacityService } from "./services/capacity.js";
import type { ChatService } from "./services/chat.js";
import type { CustomerPrivacyService } from "./services/customer-privacy.js";
import type { BusinessEventEmitter } from "./services/event-bus.js";
import type { JarvisActionService } from "./services/jarvis-action.js";
import type { JarvisAdvisorService } from "./services/jarvis-advisor.js";
import type { JarvisExecutor } from "./services/jarvis-executor.js";
import type { JarvisObserverService } from "./services/jarvis-observer.js";
import type { LoyaltyService } from "./services/loyalty.js";
import type { MailboxService } from "./services/mailbox.js";
import type { NoShowService } from "./services/no-show.js";
import type { Notifier } from "./services/notifier.js";
import type { ReminderService } from "./services/reminder.js";
import type { ReservationService } from "./services/reservation.js";
import type { ReviewRequestService } from "./services/review-request.js";
import type { ReviewService } from "./services/review.js";
import type { ScheduleRuleService } from "./services/schedule-rule.js";
import type { ServiceCatalogService } from "./services/service-catalog.js";
import type { StatsService } from "./services/stats.js";
import type { SubscriptionService } from "./services/subscription.js";
import type { TableService } from "./services/table.js";
import type { TenantMemberService } from "./services/tenant-member.js";
import type { TenantService } from "./services/tenant.js";
import type { WaitlistService } from "./services/waitlist.js";
import type { WebhookService } from "./services/webhook.js";

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
  /** Service de stats business — monté sur /v1/admin/stats si fourni. */
  stats?: StatsService;
  /** Service de gestion membres tenant — monté sur /v1/admin/members si fourni. */
  tenantMember?: TenantMemberService;
  /** Service waitlist — monté sur /v1/admin/waitlist si fourni. */
  waitlist?: WaitlistService;
  /** Service tables (inventaire) — monté sur /v1/admin/tables si fourni. */
  table?: TableService;
  /** Service fidélité — monté sur /v1/admin/loyalty si fourni. */
  loyalty?: LoyaltyService;
  /** Catalogue de prestations — monté sur /v1/admin/service-catalog si fourni. */
  serviceCatalog?: ServiceCatalogService;
  /** Règles d'ouverture — montées sur /v1/admin/schedule-rules si fournies. */
  scheduleRules?: ScheduleRuleService;
  /** Capacité — requis (avec reservation+tenant) pour le portail public /r. */
  capacity?: CapacityService;
  /** Notifier pour les annulations depuis le portail. */
  notifier?: Notifier;
  /** Service auto no-show — ajoute la function Inngest horaire si fourni. */
  noShow?: NoShowService;
  /** CRUD webhooks sortants — monté sur /v1/admin/webhooks si fourni. */
  webhook?: WebhookService;
  /** Bus d'événements — injecté dans reservations/portal pour émettre les events (journal + webhooks). */
  eventBus?: BusinessEventEmitter;
  /** Garde-fous des actions Jarvis — monté sur /v1/admin/jarvis-actions si fourni. */
  jarvisAction?: JarvisActionService;
  /** Executor Jarvis — ajoute la function Inngest 5-min si fourni. */
  jarvisExecutor?: JarvisExecutor;
  /** Advisor Jarvis — ajoute la function Inngest brief matinal si fourni. */
  jarvisAdvisor?: JarvisAdvisorService;
  /** Observer Jarvis — ajoute la function Inngest 10-min si fourni. */
  jarvisObserver?: JarvisObserverService;
  /** Boîtes Gmail — monté sur /v1/admin/mailboxes + /oauth/google/callback si OAuth configuré. */
  mailbox?: MailboxService;
  /** Avis clients — monté sur /v1/admin/reviews et /review si REVIEW_LINK_SECRET fourni. */
  review?: ReviewService;
  /** Service de demandes d'avis (cron) — ajoute la function Inngest matinale si fourni. */
  reviewRequest?: ReviewRequestService;
  /** Droit à l'oubli RGPD — monté sur /v1/admin/customers si fourni. */
  customerPrivacy?: CustomerPrivacyService;
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
    if (services.reservation)
      v1.route(
        "/reservations",
        reservationsRoute(services.reservation, services.audit, services.eventBus),
      );
    if (services.chat) v1.route("/chat", chatRoute(services.chat));
    app.route("/v1", v1);
  }

  // Portail self-service client — public, le token est l'auth (hashé en DB).
  // CORS ouvert : la page /r/[token] de la landing tourne sur un autre domaine.
  if (services.reservation && services.tenant && services.capacity) {
    app.use(
      "/r/*",
      cors({ origin: "*", allowMethods: ["GET", "POST", "PATCH", "OPTIONS"], maxAge: 86400 }),
    );
    app.route(
      "/r",
      portalRoute({
        reservation: services.reservation,
        tenant: services.tenant,
        capacity: services.capacity,
        scheduleRules: services.scheduleRules,
        notifier: services.notifier,
        webhooks: services.eventBus,
      }),
    );
  }

  // Avis post-visite — public, lien signé HMAC sur reservationId.
  if (services.reservation && services.review && services.tenant && env.REVIEW_LINK_SECRET) {
    app.use(
      "/review/*",
      cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], maxAge: 86400 }),
    );
    app.route(
      "/review",
      reviewRoute({
        reservation: services.reservation,
        review: services.review,
        tenant: services.tenant,
        secret: env.REVIEW_LINK_SECRET,
      }),
    );
  }

  // Flux iCal public signé — pas de JWT (apps calendrier), protégé par HMAC.
  if (services.reservation && services.tenant && env.ICAL_FEED_SECRET) {
    app.use("/feed/*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"], maxAge: 86400 }));
    app.route(
      "/feed",
      icalFeedRoute({
        reservation: services.reservation,
        tenant: services.tenant,
        secret: env.ICAL_FEED_SECRET,
      }),
    );
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
    if (services.stats) {
      v1Admin.route("/stats", adminStatsRoute(services.stats));
    }
    if (services.tenantMember) {
      v1Admin.route("/members", adminMembersRoute(services.tenantMember));
    }
    if (services.waitlist) {
      v1Admin.route("/waitlist", adminWaitlistRoute(services.waitlist));
    }
    if (services.table) {
      v1Admin.route("/tables", adminTablesRoute(services.table));
    }
    if (services.loyalty) {
      v1Admin.route("/loyalty", adminLoyaltyRoute(services.loyalty));
    }
    if (services.serviceCatalog) {
      v1Admin.route("/service-catalog", adminServiceCatalogRoute(services.serviceCatalog));
    }
    if (services.scheduleRules) {
      v1Admin.route("/schedule-rules", adminScheduleRulesRoute(services.scheduleRules));
    }
    if (services.reminder) {
      v1Admin.route("/reminders", adminRemindersRoute(services.reminder));
    }
    if (env.ICAL_FEED_SECRET) {
      v1Admin.route(
        "/ical",
        adminIcalRoute({ secret: env.ICAL_FEED_SECRET, apiBaseUrl: env.PUBLIC_API_URL }),
      );
    }
    if (services.webhook) {
      v1Admin.route("/webhooks", adminWebhooksRoute(services.webhook));
    }
    if (services.jarvisAction) {
      v1Admin.route("/jarvis-actions", adminJarvisActionsRoute(services.jarvisAction));
    }
    if (services.db) {
      v1Admin.route("/jarvis-brief", adminJarvisBriefRoute(services.db, services.jarvisAdvisor));
    }
    if (services.mailbox) {
      v1Admin.route("/mailboxes", adminMailboxesRoute(services.mailbox));
    }
    if (services.review) {
      v1Admin.route("/reviews", adminReviewsRoute(services.review));
    }
    if (services.customerPrivacy) {
      v1Admin.route("/customers", adminCustomersRoute(services.customerPrivacy, services.audit));
    }
    app.route("/v1/admin", v1Admin);
  }

  // Callback OAuth Google — public, Google y redirige le navigateur du patron.
  if (services.mailbox) {
    app.route("/oauth/google/callback", googleOAuthCallbackRoute(services.mailbox, env.APP_URL));
  }

  // Inngest : endpoint scrape par le dashboard pour découvrir + invoquer
  // les functions (cron rappels J-1, future events).
  if (services.reminder) {
    app.route(
      "/api/inngest",
      inngestRoute(
        services.reminder,
        services.noShow,
        services.reviewRequest,
        services.jarvisExecutor,
        services.jarvisAdvisor,
        services.jarvisObserver,
      ),
    );
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
