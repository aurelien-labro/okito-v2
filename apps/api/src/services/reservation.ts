import { createHash, randomBytes } from "node:crypto";
import { type Database, type Reservation, schema } from "@okito/db";
import {
  type ReservationCore,
  type ReservationSource,
  reservationCoreSchema,
  reservationSourceSchema,
} from "@okito/shared/types";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { HttpError, NotFoundError } from "../lib/errors.js";

class DuplicateReservationError extends HttpError {
  constructor(message = "Une réservation existe déjà sur ce créneau pour ce client.") {
    super(409, "duplicate_reservation", message);
  }
}

class UnknownMemberError extends HttpError {
  constructor() {
    super(400, "unknown_member", "Ce membre n'appartient pas à cet établissement.");
  }
}

const listFiltersSchema = z.object({
  tenantId: z.string().uuid(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type ListFilters = z.infer<typeof listFiltersSchema>;

const createInputSchema = reservationCoreSchema.extend({
  source: reservationSourceSchema.default("manual"),
});
export type CreateInput = z.infer<typeof createInputSchema>;

const updateInputSchema = reservationCoreSchema.partial().extend({
  notes: z.string().max(500).optional(),
  assignedMemberId: z.string().uuid().nullable().optional(),
});
export type UpdateInput = z.infer<typeof updateInputSchema>;

export class ReservationService {
  constructor(private readonly db: Database) {}

  async list(input: ListFilters) {
    const { tenantId, date } = listFiltersSchema.parse(input);
    const conditions = [eq(schema.reservations.tenantId, tenantId)];
    if (date) conditions.push(eq(schema.reservations.dateReservation, date));

    return this.db
      .select()
      .from(schema.reservations)
      .where(and(...conditions))
      .orderBy(desc(schema.reservations.createdAt));
  }

  /** Résas confirmées d'un tenant entre deux dates incluses (pour l'export iCal). */
  async listBetween(args: { tenantId: string; from: string; to: string }) {
    return this.db
      .select()
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.tenantId, args.tenantId),
          eq(schema.reservations.status, "confirmed"),
          gte(schema.reservations.dateReservation, args.from),
          lte(schema.reservations.dateReservation, args.to),
        ),
      )
      .orderBy(asc(schema.reservations.dateReservation), asc(schema.reservations.heure))
      .limit(2000);
  }

  async getById(args: { tenantId: string; id: string }) {
    const row = await this.db.query.reservations.findFirst({
      where: (r, { and: a, eq: e }) => a(e(r.tenantId, args.tenantId), e(r.id, args.id)),
    });
    if (!row) throw new NotFoundError("Réservation introuvable");
    return row;
  }

  async create(args: {
    tenantId: string;
    data: ReservationCore & { source?: ReservationSource };
    tableId?: string | null;
    serviceId?: string | null;
    durationMinutes?: number | null;
    assignedMemberId?: string | null;
  }) {
    const parsed = createInputSchema.parse(args.data);
    if (args.assignedMemberId) {
      await this.assertMemberOfTenant(args.tenantId, args.assignedMemberId);
    }
    // Token portail client : le brut part dans l'URL de confirmation, seul
    // le hash est persisté (une fuite DB ne permet pas de forger des liens).
    const accessToken = randomBytes(32).toString("hex");
    try {
      const [row] = await this.db
        .insert(schema.reservations)
        .values({
          tenantId: args.tenantId,
          dateReservation: parsed.dateReservation,
          heure: parsed.heure,
          couverts: parsed.couverts,
          customerName: parsed.customerName,
          customerPhone: parsed.customerPhone,
          customerEmail: parsed.customerEmail,
          notes: parsed.notes,
          source: parsed.source,
          status: "confirmed",
          tableId: args.tableId ?? null,
          serviceId: args.serviceId ?? null,
          durationMinutes: args.durationMinutes ?? null,
          assignedMemberId: args.assignedMemberId ?? null,
          accessTokenHash: hashToken(accessToken),
        })
        .returning();
      if (!row) throw new Error("insert n'a rien retourné");
      return { ...row, accessToken };
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateReservationError();
      throw err;
    }
  }

  async update(args: { tenantId: string; id: string; patch: UpdateInput }) {
    const patch = updateInputSchema.parse(args.patch);
    if (Object.keys(patch).length === 0) {
      return this.getById({ tenantId: args.tenantId, id: args.id });
    }
    if (patch.assignedMemberId) {
      await this.assertMemberOfTenant(args.tenantId, patch.assignedMemberId);
    }

    try {
      const [row] = await this.db
        .update(schema.reservations)
        .set({
          ...(patch.customerName !== undefined && { customerName: patch.customerName }),
          ...(patch.customerPhone !== undefined && { customerPhone: patch.customerPhone }),
          ...(patch.customerEmail !== undefined && { customerEmail: patch.customerEmail }),
          ...(patch.couverts !== undefined && { couverts: patch.couverts }),
          ...(patch.dateReservation !== undefined && { dateReservation: patch.dateReservation }),
          ...(patch.heure !== undefined && { heure: patch.heure }),
          ...(patch.notes !== undefined && { notes: patch.notes }),
          ...(patch.assignedMemberId !== undefined && {
            assignedMemberId: patch.assignedMemberId,
          }),
          updatedAt: new Date(),
        })
        .where(
          and(eq(schema.reservations.tenantId, args.tenantId), eq(schema.reservations.id, args.id)),
        )
        .returning();
      if (!row) throw new NotFoundError("Réservation introuvable");
      return row;
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateReservationError();
      throw err;
    }
  }

  /** Lookup par id sans filtre tenant (l'appelant a déjà vérifié l'accès, ex: lien signé). */
  async findByIdUnscoped(id: string) {
    const row = await this.db.query.reservations.findFirst({
      where: (r, { eq: e }) => e(r.id, id),
    });
    return row ?? null;
  }

  /** Lookup portail : le token brut de l'URL est hashé puis comparé. */
  async findByAccessToken(token: string): Promise<Reservation | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const row = await this.db.query.reservations.findFirst({
      where: (r, { eq: e }) => e(r.accessTokenHash, hashToken(token)),
    });
    return row ?? null;
  }

  /** Anti-IDOR : un membre ne peut être assigné que s'il appartient au tenant. */
  private async assertMemberOfTenant(tenantId: string, memberId: string): Promise<void> {
    const member = await this.db.query.tenantMembers.findFirst({
      where: (m, { and: a, eq: e }) => a(e(m.id, memberId), e(m.tenantId, tenantId)),
      columns: { id: true },
    });
    if (!member) throw new UnknownMemberError();
  }

  async findActiveByPhoneAndDate(args: {
    tenantId: string;
    customerPhone: string;
    dateReservation: string;
  }) {
    return this.db
      .select()
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.tenantId, args.tenantId),
          eq(schema.reservations.customerPhone, args.customerPhone),
          eq(schema.reservations.dateReservation, args.dateReservation),
          eq(schema.reservations.status, "confirmed"),
        ),
      )
      .limit(2);
  }

  async cancel(args: { tenantId: string; id: string }) {
    const [row] = await this.db
      .update(schema.reservations)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(schema.reservations.tenantId, args.tenantId), eq(schema.reservations.id, args.id)),
      )
      .returning();
    if (!row) throw new NotFoundError("Réservation introuvable");
    return row;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown };
  return e.code === "23505";
}

export { DuplicateReservationError };
