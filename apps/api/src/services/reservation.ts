import { type Database, schema } from "@okito/db";
import {
  type ReservationCore,
  type ReservationSource,
  reservationCoreSchema,
  reservationSourceSchema,
} from "@okito/shared/types";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, NotFoundError } from "../lib/errors.js";

class DuplicateReservationError extends HttpError {
  constructor(message = "Une réservation existe déjà sur ce créneau pour ce client.") {
    super(409, "duplicate_reservation", message);
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
  }) {
    const parsed = createInputSchema.parse(args.data);
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
        })
        .returning();
      if (!row) throw new Error("insert n'a rien retourné");
      return row;
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

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown };
  return e.code === "23505";
}

export { DuplicateReservationError };
