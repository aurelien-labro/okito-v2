import { describe, expect, it } from "vitest";
import type { ReminderService } from "../services/reminder.js";
import { createInngestFunctions } from "./functions.js";

describe("createInngestFunctions", () => {
  const fakeReminder = {
    runForTomorrow: async () => ({
      tenantsProcessed: 0,
      remindersSent: 0,
      remindersSkipped: 0,
      errors: 0,
      details: [],
    }),
  } as unknown as ReminderService;

  it("expose dailyReminders avec id reconnaissable", () => {
    const fns = createInngestFunctions(fakeReminder);
    expect(fns).toHaveLength(1);
    const fn = fns[0];
    expect(fn).toBeDefined();
    if (!fn) return;
    expect(fn.id()).toContain("daily-reminders-j1");
  });
});
