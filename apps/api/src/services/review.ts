import { type Database, type ReservationReview, schema } from "@okito/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { HttpError } from "../lib/errors.js";

class DuplicateReviewError extends HttpError {
  constructor() {
    super(409, "duplicate_review", "Un avis a déjà été laissé pour cette réservation.");
  }
}

export interface ReviewSummary {
  count: number;
  average: number;
  recent: Array<{ rating: number; comment: string | null; submittedAt: string }>;
}

/** Avis clients post-visite. Un avis unique par réservation. */
export class ReviewService {
  constructor(private readonly db: Database) {}

  async submit(args: {
    tenantId: string;
    reservationId: string;
    rating: number;
    comment?: string | null;
  }): Promise<ReservationReview> {
    try {
      const [row] = await this.db
        .insert(schema.reservationReviews)
        .values({
          tenantId: args.tenantId,
          reservationId: args.reservationId,
          rating: args.rating,
          comment: args.comment ?? null,
        })
        .returning();
      if (!row) throw new Error("reservation_reviews insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateReviewError();
      throw err;
    }
  }

  async getByReservation(reservationId: string): Promise<ReservationReview | null> {
    const row = await this.db.query.reservationReviews.findFirst({
      where: (r, { eq: e }) => e(r.reservationId, reservationId),
    });
    return row ?? null;
  }

  async summary(tenantId: string, recentLimit = 5): Promise<ReviewSummary> {
    const [agg] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        average: sql<number>`coalesce(avg(${schema.reservationReviews.rating}), 0)::float`,
      })
      .from(schema.reservationReviews)
      .where(eq(schema.reservationReviews.tenantId, tenantId));

    const recent = await this.db
      .select({
        rating: schema.reservationReviews.rating,
        comment: schema.reservationReviews.comment,
        submittedAt: schema.reservationReviews.submittedAt,
      })
      .from(schema.reservationReviews)
      .where(eq(schema.reservationReviews.tenantId, tenantId))
      .orderBy(desc(schema.reservationReviews.submittedAt))
      .limit(recentLimit);

    return {
      count: agg?.count ?? 0,
      average: Math.round((agg?.average ?? 0) * 10) / 10,
      recent: recent.map((r) => ({
        rating: r.rating,
        comment: r.comment,
        submittedAt: (r.submittedAt as Date).toISOString(),
      })),
    };
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { code?: unknown }).code === "23505";
}

export { DuplicateReviewError };
