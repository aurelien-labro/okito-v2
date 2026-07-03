import type { Reservation } from "@okito/db";
import { describe, expect, it } from "vitest";
import { buildICalendar, signFeed, verifyFeed } from "./ical.js";

function resa(over: Partial<Reservation> = {}): Reservation {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    dateReservation: "2026-07-15",
    heure: "20:00:00",
    couverts: 4,
    customerName: "Marc Dupuis",
    customerPhone: "0612345678",
    customerEmail: null,
    status: "confirmed",
    source: "manual",
    notes: null,
    createdAt: new Date("2026-07-01T10:00:00Z"),
    updatedAt: new Date("2026-07-01T10:00:00Z"),
    cancelledAt: null,
    depositStatus: "none",
    depositAmountCents: null,
    depositPaymentIntentId: null,
    tableId: null,
    serviceId: null,
    durationMinutes: null,
    assignedMemberId: null,
    accessTokenHash: null,
    ...over,
  } as Reservation;
}

describe("buildICalendar", () => {
  it("émet un VCALENDAR valide avec un VEVENT par résa", () => {
    const ics = buildICalendar({
      tenantName: "Chez Marc",
      tenantId: "t1",
      reservations: [resa()],
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:11111111-1111-4111-8111-111111111111@okito");
    expect(ics).toContain("DTSTART:20260715T200000");
    // durée par défaut 90 min → 21:30
    expect(ics).toContain("DTEND:20260715T213000");
    expect(ics).toContain("SUMMARY:Marc Dupuis · 4 p.");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("respecte durationMinutes et échappe les caractères spéciaux", () => {
    const ics = buildICalendar({
      tenantName: "X",
      tenantId: "t1",
      reservations: [resa({ durationMinutes: 30, notes: "Allergie; arachide, urgent" })],
    });
    expect(ics).toContain("DTEND:20260715T203000");
    // Déplie (RFC 5545) avant de vérifier le contenu échappé.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("Allergie\\; arachide\\, urgent");
  });

  it("plie les lignes de plus de 75 octets (RFC 5545)", () => {
    const longNote = "x".repeat(200);
    const ics = buildICalendar({
      tenantName: "X",
      tenantId: "t1",
      reservations: [resa({ notes: longNote })],
    });
    // Aucune ligne physique ne dépasse 75 caractères.
    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
    // Les continuations commencent par une espace.
    expect(ics).toContain("\r\n ");
  });
});

describe("signFeed / verifyFeed", () => {
  const secret = "super-secret-key-1234";

  it("une signature valide passe, une invalide échoue", () => {
    const sig = signFeed("tenant-abc", secret);
    expect(verifyFeed("tenant-abc", sig, secret)).toBe(true);
    expect(verifyFeed("tenant-abc", sig, "autre-secret-abcdef")).toBe(false);
    expect(verifyFeed("tenant-xyz", sig, secret)).toBe(false);
    expect(verifyFeed("tenant-abc", "deadbeef", secret)).toBe(false);
  });
});
