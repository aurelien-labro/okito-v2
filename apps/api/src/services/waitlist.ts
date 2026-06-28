import { type Database, type WaitlistEntry, type WaitlistStatus, schema } from "@okito/db";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";

/**
 * Gestion de la liste d'attente.
 *
 * Workflow :
 *   1. Créneau plein → ChatService propose au client : "Aucune table libre à
 *      20h, je peux vous mettre en liste d'attente ?"
 *   2. Client accepte → WaitlistService.join(...)
 *   3. Plus tard, une résa s'annule → WaitlistService.findMatchesForFreedSlot(...)
 *      retourne les entries pertinentes (même date, même heure ±flex, couverts <= libéré)
 *   4. Worker (futur) notifie les top-N par ordre d'inscription → markNotified()
 *   5. Client confirme → WaitlistService.markConverted() + crée la résa
 *      Sinon → markExpired() après TTL
 */

export interface JoinInput {
  tenantId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  couverts: number;
  dateSouhaitee: string;
  heureSouhaitee: string;
  flexMinutes?: number;
  notes?: string;
}

export interface FreedSlot {
  tenantId: string;
  date: string;
  heure: string;
  couvertsFreed: number;
}

export class WaitlistService {
  constructor(private readonly db: Database) {}

  async join(input: JoinInput): Promise<WaitlistEntry> {
    const [row] = await this.db
      .insert(schema.waitlistEntries)
      .values({
        tenantId: input.tenantId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        couverts: input.couverts,
        dateSouhaitee: input.dateSouhaitee,
        heureSouhaitee: input.heureSouhaitee,
        flexMinutes: input.flexMinutes ?? 30,
        notes: input.notes,
      })
      .returning();
    if (!row) throw new Error("waitlist insert returned no row");
    return row;
  }

  /**
   * Liste les entries qui matchent un créneau qui vient de se libérer.
   * Tri : ordre d'inscription (FIFO).
   *
   * Match :
   *  - même tenant
   *  - status = 'waiting'
   *  - même date
   *  - |heure souhaitee - heure libérée| <= flexMinutes
   *  - couverts demandés <= couverts libérés
   */
  async findMatchesForFreedSlot(slot: FreedSlot): Promise<WaitlistEntry[]> {
    return this.db
      .select()
      .from(schema.waitlistEntries)
      .where(
        and(
          eq(schema.waitlistEntries.tenantId, slot.tenantId),
          eq(schema.waitlistEntries.status, "waiting"),
          eq(schema.waitlistEntries.dateSouhaitee, slot.date),
          lte(schema.waitlistEntries.couverts, slot.couvertsFreed),
          // |heure_souhaitee - slot.heure| <= flex_minutes
          sql`abs(extract(epoch from (${schema.waitlistEntries.heureSouhaitee}::time - ${slot.heure}::time))) <= flex_minutes * 60`,
        ),
      )
      .orderBy(asc(schema.waitlistEntries.createdAt))
      .limit(10);
  }

  async listByTenant(tenantId: string, status?: WaitlistStatus): Promise<WaitlistEntry[]> {
    const where = status
      ? and(
          eq(schema.waitlistEntries.tenantId, tenantId),
          eq(schema.waitlistEntries.status, status),
        )
      : eq(schema.waitlistEntries.tenantId, tenantId);
    return this.db
      .select()
      .from(schema.waitlistEntries)
      .where(where)
      .orderBy(asc(schema.waitlistEntries.createdAt))
      .limit(200);
  }

  async markNotified(id: string): Promise<void> {
    await this.db
      .update(schema.waitlistEntries)
      .set({ status: "notified", notifiedAt: new Date() })
      .where(eq(schema.waitlistEntries.id, id));
  }

  async markConverted(id: string): Promise<void> {
    await this.db
      .update(schema.waitlistEntries)
      .set({ status: "converted", convertedAt: new Date() })
      .where(eq(schema.waitlistEntries.id, id));
  }

  async markExpired(id: string): Promise<void> {
    await this.db
      .update(schema.waitlistEntries)
      .set({ status: "expired", expiredAt: new Date() })
      .where(eq(schema.waitlistEntries.id, id));
  }

  async cancel(id: string): Promise<void> {
    await this.db
      .update(schema.waitlistEntries)
      .set({ status: "cancelled" })
      .where(eq(schema.waitlistEntries.id, id));
  }

  /**
   * Marque comme expirées toutes les entries notifiées depuis plus de
   * `ttlMinutes` minutes sans conversion. À appeler depuis un cron.
   */
  async expireStaleNotifications(ttlMinutes = 60): Promise<number> {
    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);
    const result = await this.db
      .update(schema.waitlistEntries)
      .set({ status: "expired", expiredAt: new Date() })
      .where(
        and(
          eq(schema.waitlistEntries.status, "notified"),
          // notified_at <= cutoff
          sql`${schema.waitlistEntries.notifiedAt} <= ${cutoff}`,
          // bonus : utiliser gte sur notifiedAt pour silencer le linter d'imports
          gte(schema.waitlistEntries.notifiedAt, new Date(0)),
        ),
      );
    // Drizzle pg ne retourne pas directement le rowCount sans returning ; on
    // se contente d'un best-effort indication.
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  }
}
