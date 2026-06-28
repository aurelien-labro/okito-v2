import "dotenv/config";
import { serve } from "@hono/node-server";
import { getDb } from "@okito/db";
import { type AppServices, createApp } from "./app.js";
import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { initSentry } from "./lib/sentry.js";
import { AuditLogService } from "./services/audit-log.js";
import { CapacityService } from "./services/capacity.js";
import { ChatService } from "./services/chat.js";
import { ConversationService } from "./services/conversation.js";
import { createLLMClient } from "./services/llm/index.js";
import { LoyaltyService } from "./services/loyalty.js";
import { createNotifier } from "./services/notifier-factory.js";
import { ReminderService } from "./services/reminder.js";
import { ReservationService } from "./services/reservation.js";
import { StatsService } from "./services/stats.js";
import { SubscriptionService } from "./services/subscription.js";
import { TableService } from "./services/table.js";
import { TenantMemberService } from "./services/tenant-member.js";
import { TenantService } from "./services/tenant.js";
import { WaitlistService } from "./services/waitlist.js";

const env = loadEnv();
initSentry(env);

const services: AppServices = {};
if (env.DATABASE_URL) {
  const db = getDb(env.DATABASE_URL);
  const reservation = new ReservationService(db);
  const conversation = new ConversationService(db);
  const tenant = new TenantService(db);
  const capacity = new CapacityService(db);
  services.reservation = reservation;
  services.tenant = tenant;
  services.audit = new AuditLogService(db);
  services.subscription = new SubscriptionService(db);
  services.stats = new StatsService(db);
  services.tenantMember = new TenantMemberService(db);
  services.waitlist = new WaitlistService(db);
  services.table = new TableService(db);
  services.loyalty = new LoyaltyService(db);
  services.db = db;

  if (env.NODE_ENV !== "production") {
    const okito = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.slug, "okito") });
    if (okito) services.defaultTenantId = okito.id;
    if (env.VAPI_PUBLIC_KEY) services.vapiPublicKey = env.VAPI_PUBLIC_KEY;
    if (env.VAPI_ASSISTANT_ID) services.vapiAssistantId = env.VAPI_ASSISTANT_ID;
  }

  const notifier = createNotifier(env);
  services.reminder = new ReminderService(db, notifier);

  if (env.GEMINI_API_KEY) {
    const llm = createLLMClient(env);
    services.chat = new ChatService({
      llm,
      conversation,
      reservation,
      tenant,
      capacity,
      notifier,
      waitlist: services.waitlist,
    });
  } else {
    logger.warn("GEMINI_API_KEY absent — moteur conversationnel désactivé");
  }
} else {
  logger.warn("DATABASE_URL absent — démarrage en mode dégradé (health only)");
}

const app = createApp(env, services);

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info({ port: info.port, env: env.NODE_ENV }, "okito-api ready");
  },
);
