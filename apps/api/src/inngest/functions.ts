import type { InngestFunction } from "inngest";
import { inngest } from "../lib/inngest.js";
import { logger } from "../lib/logger.js";
import type { NoShowService } from "../services/no-show.js";
import type { ReminderService } from "../services/reminder.js";

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

  return functions;
}
