import { inngest } from "../lib/inngest.js";
import { logger } from "../lib/logger.js";
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
export function createInngestFunctions(reminder: ReminderService) {
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

  return [dailyReminders];
}
