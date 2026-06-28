import type { Tenant, TenantNotificationPreferences } from "@okito/db";
import { describe, expect, it } from "vitest";
import { channelsFor, recipientsFor } from "./notification-policy.js";

function tenant(prefs?: TenantNotificationPreferences): Pick<Tenant, "notificationPreferences"> {
  return { notificationPreferences: prefs ?? {} };
}

describe("channelsFor", () => {
  it("retourne aucun canal si pas de prefs définies", () => {
    expect(channelsFor(tenant(), "reservation.created", "manager")).toEqual([]);
    expect(channelsFor(tenant(), "reservation.cancelled", "manager")).toEqual([]);
  });

  it("manager onCreate email only", () => {
    const t = tenant({ manager: { onCreate: { email: true } } });
    expect(channelsFor(t, "reservation.created", "manager")).toEqual(["email"]);
  });

  it("client onCreate WhatsApp + SMS", () => {
    const t = tenant({ client: { onCreate: { whatsapp: true, sms: true } } });
    expect(channelsFor(t, "reservation.created", "client")).toEqual(["whatsapp", "sms"]);
  });

  it("ne mélange pas les audiences", () => {
    const t = tenant({ manager: { onCreate: { email: true } } });
    expect(channelsFor(t, "reservation.created", "client")).toEqual([]);
  });

  it("onCancel uniquement défini pour manager", () => {
    const t = tenant({
      manager: { onCancel: { email: true } },
      client: { onCreate: { whatsapp: true } },
    });
    expect(channelsFor(t, "reservation.cancelled", "manager")).toEqual(["email"]);
    expect(channelsFor(t, "reservation.cancelled", "client")).toEqual([]);
  });

  it("onReminder uniquement défini pour client", () => {
    const t = tenant({
      client: { onReminder: { whatsapp: true } },
      manager: { onCreate: { email: true } },
    });
    expect(channelsFor(t, "reservation.reminder", "client")).toEqual(["whatsapp"]);
    expect(channelsFor(t, "reservation.reminder", "manager")).toEqual([]);
  });

  it("ignore les canaux explicitement false", () => {
    const t = tenant({ manager: { onCreate: { email: false, whatsapp: false, sms: false } } });
    expect(channelsFor(t, "reservation.created", "manager")).toEqual([]);
  });
});

describe("recipientsFor", () => {
  it("retourne manager + client si les deux sont configurés", () => {
    const t = tenant({
      manager: { onCreate: { email: true } },
      client: { onCreate: { whatsapp: true } },
    });
    const r = recipientsFor(t, "reservation.created");
    expect(r).toEqual([
      { audience: "manager", channels: ["email"] },
      { audience: "client", channels: ["whatsapp"] },
    ]);
  });

  it("ne retourne pas les audiences vides", () => {
    const t = tenant({ manager: { onCreate: { email: true } } });
    const r = recipientsFor(t, "reservation.created");
    expect(r).toHaveLength(1);
    expect(r[0]?.audience).toBe("manager");
  });
});
