import { Hono } from "hono";
import { serve } from "inngest/hono";
import { createInngestFunctions } from "../inngest/functions.js";
import { inngest } from "../lib/inngest.js";
import type { BankSyncService } from "../services/bank-sync.js";
import type { CalendarSyncService } from "../services/calendar-sync.js";
import type { GmailSyncService } from "../services/gmail-sync.js";
import type { GoogleReviewsSyncService } from "../services/google-reviews-sync.js";
import type { GraphSyncService } from "../services/graph-sync.js";
import type { ImapSyncService } from "../services/imap-sync.js";
import type { InvoiceOverdueRunner } from "../services/invoice-overdue-runner.js";
import type { JarvisAdvisorService } from "../services/jarvis-advisor.js";
import type { JarvisExecutor } from "../services/jarvis-executor.js";
import type { JarvisObserverService } from "../services/jarvis-observer.js";
import type { NoShowService } from "../services/no-show.js";
import type { ReminderService } from "../services/reminder.js";
import type { ReviewRequestService } from "../services/review-request.js";
import type { StripeSyncService } from "../services/stripe-sync.js";

/**
 * Endpoint Inngest. À monter sur `/api/inngest` :
 *   - GET → introspection (le dashboard Inngest scrape la liste des functions)
 *   - PUT → enregistre les functions (déclenché quand on déploie / quand on
 *     ajoute le endpoint dans le dashboard)
 *   - POST → invoque une function (déclenché par le cron ou par un event)
 *
 * En prod : protégé par signature Inngest si INNGEST_SIGNING_KEY est défini.
 */
export function inngestRoute(
  reminder: ReminderService,
  noShow?: NoShowService,
  reviewRequest?: ReviewRequestService,
  jarvisExecutor?: JarvisExecutor,
  jarvisAdvisor?: JarvisAdvisorService,
  jarvisObserver?: JarvisObserverService,
  gmailSync?: GmailSyncService,
  invoiceOverdue?: InvoiceOverdueRunner,
  imapSync?: ImapSyncService,
  graphSync?: GraphSyncService,
  googleReviewsSync?: GoogleReviewsSyncService,
  calendarSync?: CalendarSyncService,
  stripeSync?: StripeSyncService,
  bankSync?: BankSyncService,
) {
  const app = new Hono();
  const handler = serve({
    client: inngest,
    functions: createInngestFunctions(
      reminder,
      noShow,
      reviewRequest,
      jarvisExecutor,
      jarvisAdvisor,
      jarvisObserver,
      gmailSync,
      invoiceOverdue,
      imapSync,
      graphSync,
      googleReviewsSync,
      calendarSync,
      stripeSync,
      bankSync,
    ),
  });
  app.all("/*", handler);
  return app;
}
