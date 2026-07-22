import "dotenv/config";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { getDb } from "@okito/db";
import { type AppServices, createApp } from "./app.js";
import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { SecretBox } from "./lib/secret-box.js";
import { initSentry } from "./lib/sentry.js";
import { voiceTwimlRoute } from "./routes/voice-twiml.js";
import { AuditLogService } from "./services/audit-log.js";
import { BankConnectionService } from "./services/bank-connection.js";
import { BankSyncService } from "./services/bank-sync.js";
import { BillingService } from "./services/billing.js";
import { CalendarSyncService } from "./services/calendar-sync.js";
import { CampaignService } from "./services/campaign.js";
import { CapacityService } from "./services/capacity.js";
import { ChatService } from "./services/chat.js";
import { CoachService } from "./services/coach.js";
import {
  ConnectorMarketplaceService,
  parseTrustedPublishers,
} from "./services/connector-marketplace.js";
import { ConversationService } from "./services/conversation.js";
import { CustomerPrivacyService } from "./services/customer-privacy.js";
import { CustomerTimelineService } from "./services/customer-timeline.js";
import { EventBusService } from "./services/event-bus.js";
import { ExternalConnectorTool } from "./services/external-connector-tool.js";
import { GmailSyncService } from "./services/gmail-sync.js";
import { GoogleAdsService } from "./services/google-ads.js";
import { GoogleBusinessService } from "./services/google-business.js";
import { GoogleCalendarService } from "./services/google-calendar.js";
import { GoogleReviewsSyncService } from "./services/google-reviews-sync.js";
import { GraphSyncService } from "./services/graph-sync.js";
import { ImapMailboxService } from "./services/imap-mailbox.js";
import { ImapSyncService } from "./services/imap-sync.js";
import { InboxService } from "./services/inbox.js";
import { InvoiceOverdueRunner } from "./services/invoice-overdue-runner.js";
import { InvoiceService } from "./services/invoice.js";
import { JarvisActionService } from "./services/jarvis-action.js";
import { JarvisAdvisorService } from "./services/jarvis-advisor.js";
import { JarvisExecutor } from "./services/jarvis-executor.js";
import { JarvisObserverService } from "./services/jarvis-observer.js";
import { JarvisToolSettingsService } from "./services/jarvis-tool-settings.js";
import { GoogleReviewReplyTool } from "./services/jarvis-tools/google-review-reply.js";
import { InvoiceRemindTool } from "./services/jarvis-tools/invoice-remind.js";
import { ReviewReplyTool } from "./services/jarvis-tools/review-reply.js";
import { SupplierInvoicePayReminderTool } from "./services/jarvis-tools/supplier-invoice-pay-reminder.js";
import { createLLMClient } from "./services/llm/index.js";
import { LoyaltyService } from "./services/loyalty.js";
import { MailboxService } from "./services/mailbox.js";
import { MetaAdsService } from "./services/meta-ads.js";
import { MicrosoftMailboxService } from "./services/microsoft-mailbox.js";
import { NoShowService } from "./services/no-show.js";
import { createNotifier } from "./services/notifier-factory.js";
import { OnboardingScanService } from "./services/onboarding-scan.js";
import { ReminderService } from "./services/reminder.js";
import { ReservationService } from "./services/reservation.js";
import { ReviewRequestService } from "./services/review-request.js";
import { ReviewService } from "./services/review.js";
import { ScheduleRuleService } from "./services/schedule-rule.js";
import { ServiceCatalogService } from "./services/service-catalog.js";
import { ShopifyConnectionService } from "./services/shopify-connection.js";
import { ShopifySyncService } from "./services/shopify-sync.js";
import { SiteGeneratorService } from "./services/site-generator.js";
import { SiteService } from "./services/site.js";
import { StatsService } from "./services/stats.js";
import { StripeAccountService } from "./services/stripe-account.js";
import { StripeSyncService } from "./services/stripe-sync.js";
import { SubscriptionService } from "./services/subscription.js";
import { SupplierInvoiceExtractionService } from "./services/supplier-invoice-extraction.js";
import { SupplierInvoiceService } from "./services/supplier-invoice.js";
import { TableService } from "./services/table.js";
import { TenantAccessService } from "./services/tenant-access.js";
import { TenantMemberService } from "./services/tenant-member.js";
import { TenantService } from "./services/tenant.js";
import { VatReportService } from "./services/vat-report.js";
import { VoiceStreamSession } from "./services/voice/stream-session.js";
import { DeepgramLiveSTT } from "./services/voice/stt-live.js";
import { DeepgramSTT } from "./services/voice/stt.js";
import { ElevenLabsTTS } from "./services/voice/tts.js";
import { VoiceOpsService } from "./services/voice/voice-ops.js";
import { VoiceProfileService } from "./services/voice/voice-profile.js";
import { VoiceTurnService } from "./services/voice/voice-turn.js";
import { WaitlistService } from "./services/waitlist.js";
import { WebhookDispatchService } from "./services/webhook-dispatch.js";
import { WebhookService } from "./services/webhook.js";
import { WoocommerceConnectionService } from "./services/woocommerce-connection.js";
import { WoocommerceSyncService } from "./services/woocommerce-sync.js";

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
  if (env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID) {
    services.billing = new BillingService(env.STRIPE_SECRET_KEY, env.STRIPE_PRICE_ID, env.APP_URL);
  } else {
    logger.warn("STRIPE_SECRET_KEY/STRIPE_PRICE_ID absents — facturation SaaS désactivée");
  }
  services.stats = new StatsService(db);
  services.tenantMember = new TenantMemberService(db);
  services.waitlist = new WaitlistService(db);
  services.table = new TableService(db);
  services.loyalty = new LoyaltyService(db);
  services.serviceCatalog = new ServiceCatalogService(db);
  services.scheduleRules = new ScheduleRuleService(db);
  services.webhook = new WebhookService(db);
  const eventBus = new EventBusService(db, new WebhookDispatchService(db));
  services.eventBus = eventBus;
  const jarvisToolSettings = new JarvisToolSettingsService(db);
  services.jarvisToolSettings = jarvisToolSettings;
  const jarvisAction = new JarvisActionService(
    db,
    eventBus,
    undefined,
    undefined,
    jarvisToolSettings,
  );
  services.jarvisAction = jarvisAction;
  const connectorMarketplace = new ConnectorMarketplaceService(
    db,
    parseTrustedPublishers(env.MARKETPLACE_TRUSTED_PUBLISHERS),
  );
  services.connectorMarketplace = connectorMarketplace;
  const jarvisExecutor = new JarvisExecutor(
    db,
    jarvisAction,
    [],
    jarvisToolSettings,
    new ExternalConnectorTool(connectorMarketplace),
  );
  services.jarvisExecutor = jarvisExecutor;
  const supplierInvoice = new SupplierInvoiceService(db, eventBus);
  services.supplierInvoice = supplierInvoice;
  services.jarvisObserver = new JarvisObserverService(
    db,
    jarvisAction,
    2,
    supplierInvoice,
    jarvisToolSettings,
  );
  services.review = new ReviewService(db, eventBus);
  services.inbox = new InboxService(db);
  services.customerTimeline = new CustomerTimelineService(db);
  const invoice = new InvoiceService(db, eventBus);
  services.invoice = invoice;
  services.invoiceOverdue = new InvoiceOverdueRunner(db, invoice);
  services.vatReport = new VatReportService(db);
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI) {
    const mailbox = new MailboxService(db, {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    });
    services.mailbox = mailbox;
    services.gmailSync = new GmailSyncService(db, mailbox, eventBus);
  } else {
    logger.warn("OAuth Google absent — connexion de boîtes Gmail désactivée");
  }
  if (env.MAILBOX_ENC_KEY) {
    const secretBox = new SecretBox(env.MAILBOX_ENC_KEY);
    const imapMailbox = new ImapMailboxService(db, secretBox);
    services.imapMailbox = imapMailbox;
    services.imapSync = new ImapSyncService(db, imapMailbox, eventBus);
    // Stripe réutilise la même clé de chiffrement (secrets au repos).
    const stripeAccount = new StripeAccountService(db, secretBox);
    services.stripeAccount = stripeAccount;
    services.stripeSync = new StripeSyncService(db, stripeAccount, eventBus);
    // La connexion bancaire réutilise la même clé de chiffrement (secrets au repos).
    const bankConnection = new BankConnectionService(db, secretBox);
    services.bankConnection = bankConnection;
    services.bankSync = new BankSyncService(db, bankConnection, eventBus);
    // Shopify réutilise la même clé de chiffrement (secrets au repos).
    const shopifyConnection = new ShopifyConnectionService(db, secretBox);
    services.shopifyConnection = shopifyConnection;
    services.shopifySync = new ShopifySyncService(db, shopifyConnection, eventBus);
    // WooCommerce réutilise la même clé de chiffrement (secrets au repos).
    const woocommerceConnection = new WoocommerceConnectionService(db, secretBox);
    services.woocommerceConnection = woocommerceConnection;
    services.woocommerceSync = new WoocommerceSyncService(db, woocommerceConnection, eventBus);
  } else {
    logger.warn(
      "MAILBOX_ENC_KEY absente — boîtes IMAP/Yahoo + Stripe + banque + Shopify + WooCommerce désactivés",
    );
  }
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_REDIRECT_URI) {
    const microsoftMailbox = new MicrosoftMailboxService(db, {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      redirectUri: env.MICROSOFT_REDIRECT_URI,
    });
    services.microsoftMailbox = microsoftMailbox;
    services.graphSync = new GraphSyncService(db, microsoftMailbox, eventBus);
  } else {
    logger.warn("OAuth Microsoft absent — connexion de boîtes Outlook/365 désactivée");
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_BUSINESS_REDIRECT_URI) {
    const googleBusiness = new GoogleBusinessService(db, {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_BUSINESS_REDIRECT_URI,
    });
    services.googleBusiness = googleBusiness;
    services.googleReviewsSync = new GoogleReviewsSyncService(db, googleBusiness, eventBus);
  } else {
    logger.warn("OAuth Google Business absent — avis Google désactivés");
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALENDAR_REDIRECT_URI) {
    const googleCalendar = new GoogleCalendarService(db, {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_CALENDAR_REDIRECT_URI,
    });
    services.googleCalendar = googleCalendar;
    services.calendarSync = new CalendarSyncService(db, googleCalendar, eventBus);
  } else {
    logger.warn("OAuth Google Calendar absent — import d'agenda désactivé");
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_ADS_REDIRECT_URI) {
    services.googleAds = new GoogleAdsService(db, {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_ADS_REDIRECT_URI,
    });
  } else {
    logger.warn("OAuth Google Ads absent — connexion Google Ads désactivée");
  }
  if (env.META_APP_ID && env.META_APP_SECRET && env.META_REDIRECT_URI) {
    services.metaAds = new MetaAdsService(db, {
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      redirectUri: env.META_REDIRECT_URI,
    });
  } else {
    logger.warn("OAuth Meta absent — connexion Meta Ads désactivée");
  }
  services.customerPrivacy = new CustomerPrivacyService(db);
  services.tenantAccess = new TenantAccessService(db);
  services.db = db;

  if (env.NODE_ENV !== "production") {
    const okito = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.slug, "okito") });
    if (okito) services.defaultTenantId = okito.id;
    if (env.VAPI_PUBLIC_KEY) services.vapiPublicKey = env.VAPI_PUBLIC_KEY;
    if (env.VAPI_ASSISTANT_ID) services.vapiAssistantId = env.VAPI_ASSISTANT_ID;
  }

  services.capacity = capacity;

  const notifier = createNotifier(env);
  services.notifier = notifier;
  services.reminder = new ReminderService(db, notifier);
  services.campaign = new CampaignService(db, notifier, eventBus);
  services.site = new SiteService(db, eventBus);
  if (env.REVIEW_LINK_SECRET) {
    services.reviewRequest = new ReviewRequestService(
      db,
      notifier,
      env.REVIEW_LINK_SECRET,
      env.PORTAL_URL,
    );
  }
  services.noShow = new NoShowService(db, services.audit, 120, services.eventBus);
  // Rappel d'echeance fournisseur : texte deterministe, pas besoin de LLM —
  // enregistre meme si GEMINI_API_KEY est absent.
  jarvisExecutor.registerTool(new SupplierInvoicePayReminderTool(db, notifier, supplierInvoice));

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
      loyalty: services.loyalty,
      serviceCatalog: services.serviceCatalog,
      scheduleRules: services.scheduleRules,
      webhooks: services.eventBus,
    });
    services.jarvisAdvisor = new JarvisAdvisorService(db, llm, eventBus, notifier);
    services.coach = new CoachService(db, llm);
    jarvisExecutor.registerTool(new ReviewReplyTool(db, llm, notifier));
    jarvisExecutor.registerTool(new InvoiceRemindTool(db, llm, notifier, invoice));
    if (services.googleBusiness) {
      jarvisExecutor.registerTool(new GoogleReviewReplyTool(llm, services.googleBusiness));
    }
    const { defaultPdfTextExtractor } = await import("./lib/pdf-text.js");
    services.supplierInvoiceExtraction = new SupplierInvoiceExtractionService(
      llm,
      defaultPdfTextExtractor,
    );
    services.onboardingScan = new OnboardingScanService(
      db,
      llm,
      eventBus,
      env.GOOGLE_PLACES_API_KEY,
    );
    if (services.site) {
      services.siteGenerator = new SiteGeneratorService(
        services.onboardingScan,
        services.site,
        llm,
      );
    }
    if (env.DEEPGRAM_API_KEY && env.ELEVENLABS_API_KEY) {
      const fileStt = new DeepgramSTT(env.DEEPGRAM_API_KEY);
      const fileTts = new ElevenLabsTTS(env.ELEVENLABS_API_KEY, env.ELEVENLABS_VOICE_ID);
      services.voiceTurn = new VoiceTurnService(fileStt, fileTts, services.chat);
      // Voix Jarvis (vague 5) : le patron parle à Jarvis au micro du dashboard.
      services.jarvisVoice = { stt: fileStt, tts: fileTts };
      // Voice cloning : profil vocal (voix clonée) par tenant.
      services.voiceProfile = new VoiceProfileService(db, env.ELEVENLABS_API_KEY);
      // Exploitation : santé du pipeline + journal des latences d'appel.
      services.voiceOps = new VoiceOpsService(
        env.DEEPGRAM_API_KEY,
        env.ELEVENLABS_API_KEY,
        Boolean(env.VOICE_STREAM_SECRET && env.VOICE_STREAM_PUBLIC_URL),
        services.voiceProfile,
      );
    } else {
      logger.warn("DEEPGRAM_API_KEY/ELEVENLABS_API_KEY absentes — pipeline voix maison désactivé");
    }
  } else {
    logger.warn("GEMINI_API_KEY absent — moteur conversationnel désactivé");
  }
} else {
  logger.warn("DATABASE_URL absent — démarrage en mode dégradé (health only)");
}

// Drain Fly : SIGTERM → /health passe 503 (machine sortie de rotation),
// les sessions voix en cours sont coupées proprement, puis le serveur ferme.
let shuttingDown = false;
services.isShuttingDown = () => shuttingDown;
const activeVoiceSockets = new Set<{ stop: () => void }>();

const app = createApp(env, services);

// Streaming voix v2 (Twilio Media Streams) : monté hors createApp car le
// WebSocket doit être injecté dans le serveur node après serve().
let injectWebSocket: ((server: unknown) => void) | undefined;
if (
  services.chat &&
  env.DEEPGRAM_API_KEY &&
  env.ELEVENLABS_API_KEY &&
  env.VOICE_STREAM_SECRET &&
  env.VOICE_STREAM_PUBLIC_URL
) {
  const chat = services.chat;
  const secret = env.VOICE_STREAM_SECRET;
  const streamStt = new DeepgramLiveSTT(env.DEEPGRAM_API_KEY);
  const streamTts = new ElevenLabsTTS(
    env.ELEVENLABS_API_KEY,
    env.ELEVENLABS_VOICE_ID,
    fetch,
    "ulaw_8000",
  );
  // Voice cloning : si le tenant a un clone actif, l'appel parle avec sa voix.
  const voiceProfile = services.voiceProfile;
  const elevenLabsKey = env.ELEVENLABS_API_KEY;
  const resolveTts = voiceProfile
    ? async (tenantId: string) => {
        const voiceId = await voiceProfile.voiceIdFor(tenantId);
        return voiceId ? new ElevenLabsTTS(elevenLabsKey, voiceId, fetch, "ulaw_8000") : undefined;
      }
    : undefined;
  const nodeWs = createNodeWebSocket({ app });
  injectWebSocket = nodeWs.injectWebSocket as (server: unknown) => void;
  app.get(
    "/v1/voice/stream",
    nodeWs.upgradeWebSocket(() => {
      let session: VoiceStreamSession | undefined;
      let handle: { stop: () => void } | undefined;
      return {
        onOpen(_evt, ws) {
          if (shuttingDown) {
            ws.close();
            return;
          }
          handle = {
            stop: () => {
              void session?.handleMessage({ event: "stop" });
              ws.close();
            },
          };
          activeVoiceSockets.add(handle);
          const voiceOps = services.voiceOps;
          session = new VoiceStreamSession({
            stt: streamStt,
            tts: streamTts,
            chat,
            secret,
            resolveTts,
            send: (m) => ws.send(JSON.stringify(m)),
            close: () => ws.close(),
            onCallStart: (callSid, tid) => voiceOps?.callStarted(callSid, tid),
            onTurn: (callSid, metrics) => voiceOps?.recordTurn(callSid, metrics),
          });
        },
        onMessage(evt) {
          try {
            void session?.handleMessage(JSON.parse(String(evt.data)));
          } catch {
            // frame non-JSON ignorée
          }
        },
        onClose() {
          // Ferme le socket Deepgram et coupe la synthèse en cours.
          if (handle) activeVoiceSockets.delete(handle);
          void session?.handleMessage({ event: "stop" });
        },
      };
    }),
  );
  app.route(
    "/v1/voice",
    voiceTwimlRoute(
      secret,
      env.VOICE_STREAM_PUBLIC_URL,
      // Même politique que le webhook WhatsApp : signature exigée en prod via
      // TWILIO_VALIDATE_WEBHOOK=true (en dev, l'URL du tunnel ≠ PUBLIC_API_URL).
      env.TWILIO_VALIDATE_WEBHOOK === "true" && env.TWILIO_AUTH_TOKEN
        ? { authToken: env.TWILIO_AUTH_TOKEN, publicBaseUrl: env.PUBLIC_API_URL }
        : undefined,
    ),
  );
  logger.info("pipeline voix v3 : streaming live Twilio actif (/v1/voice/stream)");
} else if (env.DEEPGRAM_API_KEY && env.ELEVENLABS_API_KEY) {
  logger.warn(
    "VOICE_STREAM_SECRET/VOICE_STREAM_PUBLIC_URL absentes — streaming Twilio désactivé (banc d'essai /turn seul)",
  );
}

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info({ port: info.port, env: env.NODE_ENV }, "okito-api ready");
  },
);
injectWebSocket?.(server);

// Arrêt propre : Fly envoie SIGINT/SIGTERM puis tue après kill_timeout.
// Ordre : health→503 (drain LB) → fermer les WS voix → server.close() →
// exit. Garde-fou : exit forcé avant le kill_timeout si un socket traîne.
const FORCE_EXIT_MS = 25_000;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, voiceSockets: activeVoiceSockets.size }, "arrêt en cours — drain");
  for (const socket of activeVoiceSockets) socket.stop();
  activeVoiceSockets.clear();
  server.close(() => {
    logger.info("okito-api arrêté proprement");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("arrêt forcé après timeout de drain");
    process.exit(1);
  }, FORCE_EXIT_MS).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
