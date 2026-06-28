import type { Reservation, Tenant, TenantNotificationPreferences } from "@okito/db";
import { describe, expect, it, vi } from "vitest";
import type { NotificationInput, Notifier } from "./notifier.js";
import { PolicyAwareNotifier } from "./policy-aware-notifier.js";

function makeBase() {
  const sent: NotificationInput[] = [];
  const base: Notifier = {
    send: vi.fn(async (input) => {
      sent.push(input);
      return { delivered: true, provider: "test" };
    }),
    notifyReservationCreated: vi.fn(async () => {}),
    notifyReservationCancelled: vi.fn(async () => {}),
  };
  return { base, sent };
}

function tenant(prefs: TenantNotificationPreferences, extra: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-1",
    name: "Test Resto",
    contactEmail: "manager@test.fr",
    contactPhone: "+33611111111",
    notificationPreferences: prefs,
    ...extra,
  } as Tenant;
}

function reservation(extra: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    customerName: "Alice Dupont",
    customerPhone: "+33622222222",
    customerEmail: "alice@example.com",
    couverts: 4,
    dateReservation: "2026-06-30",
    heure: "20:00:00",
    status: "confirmed",
    source: "web_widget",
    notes: null,
    ...extra,
  } as Reservation;
}

describe("PolicyAwareNotifier.notifyReservationCreated", () => {
  it("envoie au manager email + client whatsapp selon prefs", async () => {
    const { base, sent } = makeBase();
    const n = new PolicyAwareNotifier(base);
    await n.notifyReservationCreated(
      tenant({
        manager: { onCreate: { email: true } },
        client: { onCreate: { whatsapp: true } },
      }),
      reservation(),
    );
    expect(sent).toHaveLength(2);
    expect(sent.find((s) => s.channel === "email")?.to).toBe("manager@test.fr");
    expect(sent.find((s) => s.channel === "whatsapp")?.to).toBe("+33622222222");
  });

  it("aucun envoi si prefs vides", async () => {
    const { base, sent } = makeBase();
    const n = new PolicyAwareNotifier(base);
    await n.notifyReservationCreated(tenant({}), reservation());
    expect(sent).toHaveLength(0);
  });

  it("skip silencieusement si contact manquant (pas d'email manager)", async () => {
    const { base, sent } = makeBase();
    const n = new PolicyAwareNotifier(base);
    await n.notifyReservationCreated(
      tenant({ manager: { onCreate: { email: true, sms: true } } }, { contactEmail: null }),
      reservation(),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.channel).toBe("sms");
    expect(sent[0]?.to).toBe("+33611111111");
  });

  it("context inclut audience et reservationId", async () => {
    const { base, sent } = makeBase();
    const n = new PolicyAwareNotifier(base);
    await n.notifyReservationCreated(
      tenant({ manager: { onCreate: { email: true } } }),
      reservation(),
    );
    expect(sent[0]?.context).toMatchObject({
      type: "reservation.created",
      audience: "manager",
      reservationId: "res-1",
    });
  });
});

describe("PolicyAwareNotifier.notifyReservationCancelled", () => {
  it("respecte onCancel uniquement pour manager", async () => {
    const { base, sent } = makeBase();
    const n = new PolicyAwareNotifier(base);
    await n.notifyReservationCancelled(
      tenant({
        manager: { onCancel: { email: true } },
        client: { onReminder: { whatsapp: true } },
      }),
      reservation(),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.context).toMatchObject({ audience: "manager" });
  });
});
