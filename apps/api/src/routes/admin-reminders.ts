import { Hono } from "hono";
import type { ReminderService } from "../services/reminder.js";

/**
 * Endpoint admin (dev) pour déclencher manuellement le run des rappels J-1.
 * En prod : remplacer par un trigger Inngest à 9h Europe/Paris.
 *
 * Usage : POST /v1/admin/reminders/run?dryRun=true
 */
export function adminRemindersRoute(service: ReminderService) {
  const app = new Hono();

  app.post("/run", async (c) => {
    const dryRun = c.req.query("dryRun") === "true";
    const result = await service.runForTomorrow({ dryRun });
    return c.json(result);
  });

  return app;
}
