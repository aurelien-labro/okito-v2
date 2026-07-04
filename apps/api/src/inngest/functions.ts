import type { InngestFunction } from "inngest";
import { inngest } from "../lib/inngest.js";
import { logger } from "../lib/logger.js";
import type { GmailSyncService } from "../services/gmail-sync.js";
import type { InvoiceOverdueRunner } from "../services/invoice-overdue-runner.js";
import type { JarvisAdvisorService } from "../services/jarvis-advisor.js";
import type { JarvisExecutor } from "../services/jarvis-executor.js";
import type { JarvisObserverService } from "../services/jarvis-observer.js";
import type { NoShowService } from "../services/no-show.js";
import type { ReminderService } from "../services/reminder.js";
import type { ReviewRequestService } from "../services/review-request.js";

/**
 * Functions Inngest exposées par l'API.
 *
 * `dailyReminders` : tous les jours à 9h Europe/Paris, déclenche
 * `ReminderService.runForTomorrow()` qui itère sur tous les tenants actifs
 * et envoie un rappel J-1 à chaque résa confirmée pour demain.
 *
 * Note multi-tenant : 9h Europe/Paris = ~tôt-matin pour Paris/Madrid (cible
 * principale). Le ReminderService recalcule "demain" dans le fuseau de
 * chaque tenant — donc un tenant New York à 3h locale verra quand même son
 * "demain" calculé proprement. Sera affiné si on cible des tenants
 * géographiquement très éloignés.
 */
export function createInngestFunctions(
  reminder: ReminderService,
  noShow?: NoShowService,
  reviewRequest?: ReviewRequestService,
  jarvisExecutor?: JarvisExecutor,
  jarvisAdvisor?: JarvisAdvisorService,
  jarvisObserver?: JarvisObserverService,
  gmailSync?: GmailSyncService,
  invoiceOverdue?: InvoiceOverdueRunner,
): InngestFunction.Any[] {
  const dailyReminders = inngest.createFunction(
    {
      id: "daily-reminders-j1",
      name: "Rappels J-1 (9h Europe/Paris)",
      triggers: [{ cron: "TZ=Europe/Paris 0 9 * * *" }],
    },
    async ({ step }) => {
      const result = await step.run("run-for-tomorrow", async () => reminder.runForTomorrow());
      logger.info({ result }, "Inngest: dailyReminders terminé");
      return result;
    },
  );

  const functions: InngestFunction.Any[] = [dailyReminders];

  if (noShow) {
    const markNoShows = inngest.createFunction(
      {
        id: "mark-no-shows",
        name: "Auto no-show (toutes les heures)",
        triggers: [{ cron: "0 * * * *" }],
      },
      async ({ step }) => {
        const result = await step.run("mark-stale", async () => noShow.markStale());
        logger.info({ result }, "Inngest: markNoShows terminé");
        return result;
      },
    );
    functions.push(markNoShows);
  }

  if (reviewRequest) {
    const sendReviewRequests = inngest.createFunction(
      {
        id: "send-review-requests",
        name: "Demandes d'avis (10h Europe/Paris)",
        triggers: [{ cron: "TZ=Europe/Paris 0 10 * * *" }],
      },
      async ({ step }) => {
        const result = await step.run("run-for-yesterday", async () =>
          reviewRequest.runForYesterday(),
        );
        logger.info({ result }, "Inngest: sendReviewRequests terminé");
        return result;
      },
    );
    functions.push(sendReviewRequests);
  }

  if (jarvisExecutor) {
    const runJarvisActions = inngest.createFunction(
      {
        id: "jarvis-executor",
        name: "Exécution actions Jarvis (toutes les 5 min)",
        triggers: [{ cron: "*/5 * * * *" }],
      },
      async ({ step }) => {
        const result = await step.run("run-once", async () => jarvisExecutor.runOnce());
        if (result.executed > 0 || result.failed > 0) {
          logger.info({ result }, "Inngest: jarvisExecutor terminé");
        }
        return result;
      },
    );
    functions.push(runJarvisActions);
  }

  if (jarvisAdvisor) {
    const morningBriefs = inngest.createFunction(
      {
        id: "jarvis-morning-briefs",
        name: "Briefs matinaux Jarvis (8h Europe/Paris)",
        triggers: [{ cron: "TZ=Europe/Paris 0 8 * * *" }],
      },
      async ({ step }) => {
        const result = await step.run("run-for-all-tenants", async () =>
          jarvisAdvisor.runForAllTenants(),
        );
        logger.info({ result }, "Inngest: jarvisMorningBriefs terminé");
        return result;
      },
    );
    functions.push(morningBriefs);
  }

  if (jarvisObserver) {
    const observeEvents = inngest.createFunction(
      {
        id: "jarvis-observer",
        name: "Observer Jarvis (toutes les 10 min)",
        triggers: [{ cron: "*/10 * * * *" }],
      },
      async ({ step }) => {
        const result = await step.run("run-once", async () => jarvisObserver.runOnce());
        if (result.actionsProposed > 0) {
          logger.info({ result }, "Inngest: jarvisObserver terminé");
        }
        return result;
      },
    );
    functions.push(observeEvents);
  }

  if (gmailSync) {
    const syncGmail = inngest.createFunction(
      {
        id: "gmail-sync",
        name: "Sync boîtes Gmail (toutes les 5 min)",
        triggers: [{ cron: "*/5 * * * *" }],
      },
      async ({ step }) => {
        const result = await step.run("run-once", async () => gmailSync.runOnce());
        if (result.emailsIngested > 0 || result.errors > 0) {
          logger.info({ result }, "Inngest: gmailSync terminé");
        }
        return result;
      },
    );
    functions.push(syncGmail);
  }

  if (invoiceOverdue) {
    const markOverdue = inngest.createFunction(
      {
        id: "invoices-mark-overdue",
        name: "Factures échues → overdue (chaque heure)",
        triggers: [{ cron: "15 * * * *" }],
      },
      async ({ step }) => {
        const result = await step.run("mark-overdue", async () => invoiceOverdue.runOnce());
        if (result.marked > 0) logger.info({ result }, "Inngest: invoicesMarkOverdue terminé");
        return result;
      },
    );
    functions.push(markOverdue);
  }

  return functions;
}
