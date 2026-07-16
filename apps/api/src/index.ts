import "dotenv/config";
import { serve } from "@hono/node-server";
import { getDb } from "@okito/db";
import { type AppServices, createApp } from "./app.js";
import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { SecretBox } from "./lib/secret-box.js";
import { initSentry } from "./lib/sentry.js";
import { AuditLogService } from "./services/audit-log.js";
import { BankConnectionService } from "./services/bank-connection.js";
import { BankSyncService } from "./services/bank-sync.js";
import { CalendarSyncService } from "./services/calendar-sync.js";
import { CampaignService } from "./services/campaign.js";
import { CapacityService } from "./services/capacity.js";
import { ChatService } from "./services/chat.js";
import { ConversationService } from "./services/conversation.js";
import { CustomerPrivacyService } from "./services/customer-privacy.js";
import { CustomerTimelineService } from "./services/customer-timeline.js";
import { EventBusService } from "./services/event-bus.js";
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
  const jarvisAction = new JarvisActionService(db, eventBus);
  services.jarvisAction = jarvisAction;
  const jarvisExecutor = new JarvisExecutor(db, jarvisAction);
  services.jarvisExecutor = jarvisExecutor;
  const supplierInvoice = new SupplierInvoiceService(db, eventBus);
  services.supplierInvoice = supplierInvoice;
  services.jarvisObserver = new JarvisObserverService(db, jarvisAction, 2, supplierInvoice);
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
    jarvisExecutor.registerTool(new ReviewReplyTool(db, llm, notifier));
    jarvisExecutor.registerTool(new InvoiceRemindTool(db, llm, notifier, invoice));
    if (services.googleBusiness) {
      jarvisExecutor.registerTool(new GoogleReviewReplyTool(llm, services.googleBusiness));
    }
    services.supplierInvoiceExtraction = new SupplierInvoiceExtractionService(llm);
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
