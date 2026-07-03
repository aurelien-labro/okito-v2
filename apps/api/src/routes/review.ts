import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError, NotFoundError } from "../lib/errors.js";
import { verifyFeed } from "../lib/ical.js";
import type { AppEnv } from "../lib/types.js";
import type { ReservationService } from "../services/reservation.js";
import type { ReviewService } from "../services/review.js";
import type { TenantService } from "../services/tenant.js";

const uuidParam = z.string().uuid();
const submitSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export interface ReviewDeps {
  reservation: ReservationService;
  review: ReviewService;
  tenant: TenantService;
  secret: string;
}

/**
 * Avis post-visite — public, sans JWT. Le lien est signé HMAC sur le
 * reservationId (le token portail hashé ne peut pas être reconstruit après
 * coup). Réutilise verifyFeed (même primitive HMAC que le flux iCal).
 */
export function reviewRoute(deps: ReviewDeps) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    return c.json({ error: { code: "internal_error", message: "Erreur serveur" } }, 500);
  });

  // GET /review/:reservationId?sig= → détails minimaux + avis déjà donné ?
  app.get("/:reservationId", async (c) => {
    const { reservation, tenant } = await load(deps, c);
    const existing = await deps.review.getByReservation(reservation.id);
    return c.json({
      data: {
        tenantName: tenant.name,
        customerFirstName: reservation.customerName.trim().split(/\s+/)[0],
        dateReservation: reservation.dateReservation,
        alreadyReviewed: !!existing,
        rating: existing?.rating ?? null,
      },
    });
  });

  // POST /review/:reservationId?sig= → soumet l'avis
  app.post("/:reservationId", async (c) => {
    const { reservation, tenant } = await load(deps, c);
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message ?? "Corps invalide");
    }
    const review = await deps.review.submit({
      tenantId: tenant.id,
      reservationId: reservation.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    });
    return c.json({ data: { rating: review.rating } }, 201);
  });

  return app;
}

async function load(
  deps: ReviewDeps,
  c: { req: { param: (k: string) => string; query: (k: string) => string | undefined } },
) {
  const reservationId = c.req.param("reservationId");
  const sig = c.req.query("sig") ?? "";
  if (!uuidParam.safeParse(reservationId).success || !verifyFeed(reservationId, sig, deps.secret)) {
    throw new NotFoundError("Lien d'avis invalide", "invalid_review_link");
  }
  const reservation = await deps.reservation.findByIdUnscoped(reservationId);
  if (!reservation) throw new NotFoundError("Réservation introuvable", "unknown_reservation");
  const tenant = await deps.tenant.getById(reservation.tenantId);
  return { reservation, tenant };
}
