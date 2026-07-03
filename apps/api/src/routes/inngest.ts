import { Hono } from "hono";
import { serve } from "inngest/hono";
import { createInngestFunctions } from "../inngest/functions.js";
import { inngest } from "../lib/inngest.js";
import type { NoShowService } from "../services/no-show.js";
import type { ReminderService } from "../services/reminder.js";

/**
 * Endpoint Inngest. À monter sur `/api/inngest` :
 *   - GET → introspection (le dashboard Inngest scrape la liste des functions)
 *   - PUT → enregistre les functions (déclenché quand on déploie / quand on
 *     ajoute le endpoint dans le dashboard)
 *   - POST → invoque une function (déclenché par le cron ou par un event)
 *
 * En prod : protégé par signature Inngest si INNGEST_SIGNING_KEY est défini.
 */
export function inngestRoute(reminder: ReminderService, noShow?: NoShowService) {
  const app = new Hono();
  const handler = serve({
    client: inngest,
    functions: createInngestFunctions(reminder, noShow),
  });
  app.all("/*", handler);
  return app;
}
