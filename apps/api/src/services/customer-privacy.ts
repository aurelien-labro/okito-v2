import { randomBytes } from "node:crypto";
import { type Database, schema } from "@okito/db";
import { and, eq, inArray } from "drizzle-orm";

export interface ForgetResult {
  reservationsAnonymized: number;
  waitlistAnonymized: number;
  reviewsDeleted: number;
}

const ANON_NAME = "[client supprimé]";

/**
 * Droit à l'oubli RGPD : anonymise toutes les traces PII d'un client (par
 * téléphone) dans un tenant. On conserve les lignes (agrégats stats) mais on
 * scrubbe nom / téléphone / email / notes. Les avis (texte libre) sont supprimés.
 */
export class CustomerPrivacyService {
  constructor(private readonly db: Database) {}

  async forget(tenantId: string, phone: string): Promise<ForgetResult> {
    // Suffixe unique par demande : évite qu'un second effacement (autre client)
    // au même créneau ne heurte l'index unique (tenant, phone, date, heure).
    const anonPhone = `[supprimé-${randomBytes(6).toString("hex")}]`;

    const reservations = await this.db
      .update(schema.reservations)
      .set({
        customerName: ANON_NAME,
        customerPhone: anonPhone,
        customerEmail: null,
        notes: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.reservations.tenantId, tenantId),
          eq(schema.reservations.customerPhone, phone),
        ),
      )
      .returning({ id: schema.reservations.id });

    const waitlist = await this.db
      .update(schema.waitlistEntries)
      .set({
        customerName: ANON_NAME,
        customerPhone: anonPhone,
        customerEmail: null,
        notes: null,
      })
      .where(
        and(
          eq(schema.waitlistEntries.tenantId, tenantId),
          eq(schema.waitlistEntries.customerPhone, phone),
        ),
      )
      .returning({ id: schema.waitlistEntries.id });

    // Les avis sont du texte libre potentiellement identifiant → suppression
    // pour les réservations anonymisées.
    let reviewsDeleted = 0;
    if (reservations.length > 0) {
      const deleted = await this.db
        .delete(schema.reservationReviews)
        .where(
          inArray(
            schema.reservationReviews.reservationId,
            reservations.map((r) => r.id),
          ),
        )
        .returning({ id: schema.reservationReviews.id });
      reviewsDeleted = deleted.length;
    }

    return {
      reservationsAnonymized: reservations.length,
      waitlistAnonymized: waitlist.length,
      reviewsDeleted,
    };
  }
}
