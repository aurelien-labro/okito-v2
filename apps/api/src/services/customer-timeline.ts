import { type Database, schema } from "@okito/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export interface TimelineEntry {
  kind: "reservation" | "review" | "email";
  at: string;
  title: string;
  detail: string | null;
}

export interface CustomerProfile {
  phone: string;
  name: string;
  email: string | null;
  visitCount: number;
  cancelledCount: number;
  noShowCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  averageRating: number | null;
  timeline: TimelineEntry[];
}

/**
 * Fiche client 360° (module Clients V3).
 *
 * Reconstruit tout ce qui touche un client (identifié par téléphone) à partir
 * de la source de vérité — les réservations — enrichie par les avis liés et,
 * si le client a un email connu, ses emails entrants du journal. Aucune table
 * dédiée : agrégation à la volée, cohérente avec loyalty.
 */
export class CustomerTimelineService {
  constructor(private readonly db: Database) {}

  async getByPhone(tenantId: string, phone: string): Promise<CustomerProfile | null> {
    const reservations = await this.db
      .select()
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.tenantId, tenantId),
          eq(schema.reservations.customerPhone, phone),
        ),
      )
      .orderBy(desc(schema.reservations.dateReservation));

    if (reservations.length === 0) return null;

    const name = reservations[0]?.customerName ?? "Client";
    const email = reservations.find((r) => r.customerEmail)?.customerEmail ?? null;
    const visitCount = reservations.filter(
      (r) => r.status === "confirmed" || r.status === "completed",
    ).length;
    const cancelledCount = reservations.filter((r) => r.status === "cancelled").length;
    const noShowCount = reservations.filter((r) => r.status === "no_show").length;

    const reservationIds = reservations.map((r) => r.id);
    const reviews =
      reservationIds.length > 0
        ? await this.db
            .select()
            .from(schema.reservationReviews)
            .where(
              and(
                eq(schema.reservationReviews.tenantId, tenantId),
                inArray(schema.reservationReviews.reservationId, reservationIds),
              ),
            )
        : [];

    const emails = email
      ? await this.db
          .select()
          .from(schema.events)
          .where(
            and(
              eq(schema.events.tenantId, tenantId),
              eq(schema.events.type, "email.received"),
              sql`lower(${schema.events.payload}->>'from') like ${`%${email.toLowerCase()}%`}`,
            ),
          )
          .orderBy(desc(schema.events.createdAt))
          .limit(50)
      : [];

    const timeline: TimelineEntry[] = [];

    for (const r of reservations) {
      // Une visite apparaît à sa date de réservation (quand elle a eu lieu),
      // une annulation à la date d'annulation.
      const at =
        r.status === "cancelled" && r.cancelledAt
          ? r.cancelledAt.toISOString()
          : reservationDateTime(r.dateReservation, String(r.heure));
      timeline.push({
        kind: "reservation",
        at,
        title: reservationTitle(r.status),
        detail: `${fmtDate(r.dateReservation)} à ${String(r.heure).slice(0, 5)} · ${r.couverts} couvert(s)`,
      });
    }
    for (const rv of reviews) {
      timeline.push({
        kind: "review",
        at: (rv.submittedAt as Date).toISOString(),
        title: `Avis ${rv.rating}★`,
        detail: rv.comment,
      });
    }
    for (const e of emails) {
      const p = e.payload as { subject?: string | null; snippet?: string | null };
      timeline.push({
        kind: "email",
        at: e.createdAt.toISOString(),
        title: `Email reçu — ${p.subject ?? "(sans objet)"}`,
        detail: p.snippet ?? null,
      });
    }
    timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

    const ratings = reviews.map((r) => r.rating);
    const averageRating =
      ratings.length > 0
        ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
        : null;

    const dates = reservations.map((r) => r.dateReservation).sort();

    return {
      phone,
      name,
      email,
      visitCount,
      cancelledCount,
      noShowCount,
      firstSeen: dates[0] ?? null,
      lastSeen: dates.at(-1) ?? null,
      averageRating,
      timeline,
    };
  }
}

function reservationTitle(status: string): string {
  switch (status) {
    case "cancelled":
      return "Réservation annulée";
    case "no_show":
      return "No-show";
    case "completed":
      return "Visite";
    default:
      return "Réservation";
  }
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : iso;
}

function reservationDateTime(date: string, heure: string): string {
  const parsed = new Date(`${date}T${heure.length === 5 ? `${heure}:00` : heure}`);
  return Number.isNaN(parsed.getTime()) ? `${date}T00:00:00.000Z` : parsed.toISOString();
}
