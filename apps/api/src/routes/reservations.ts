import { reservationCoreSchema, reservationSourceSchema } from "@okito/shared/types";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import { IdempotencyCache } from "../lib/idempotency.js";
import type { AppEnv } from "../lib/types.js";
import type { ReservationService } from "../services/reservation.js";

const uuidParam = z.string().uuid();
const dateQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createBodySchema = reservationCoreSchema.extend({
  source: reservationSourceSchema.optional(),
});
const updateBodySchema = reservationCoreSchema.partial();

/** Cache global idempotency partagé entre toutes les routes /v1/reservations. */
const idempotency = new IdempotencyCache();

export function reservationsRoute(service: ReservationService) {
  const app = new Hono<AppEnv>();

  // GET /v1/reservations?date=YYYY-MM-DD
  app.get("/", async (c) => {
    const tenantId = c.get("tenantId");
    const dateRaw = c.req.query("date");
    const date = dateRaw ? parseOrThrow(dateQuery, dateRaw, "date") : undefined;
    const rows = await service.list({ tenantId, date });
    return c.json({ data: rows });
  });

  // GET /v1/reservations/:id
  app.get("/:id", async (c) => {
    const tenantId = c.get("tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const row = await service.getById({ tenantId, id });
    return c.json({ data: row });
  });

  // POST /v1/reservations
  // Supporte `Idempotency-Key: <token>` — si la même clé est rejouée par le
  // même tenant dans les 24h, on renvoie la réponse cachée au lieu de
  // re-créer. Indispensable pour Vapi/WhatsApp où les retries arrivent.
  app.post("/", async (c) => {
    const tenantId = c.get("tenantId");
    const idemKey = c.req.header("idempotency-key")?.trim();

    if (idemKey) {
      const cached = idempotency.get(tenantId, idemKey);
      if (cached) {
        return c.json(cached.body as object, cached.status as 200);
      }
    }

    const body = await readJson(c);
    const data = parseOrThrow(createBodySchema, body, "body");
    const row = await service.create({ tenantId, data });
    const responseBody = { data: row };

    if (idemKey) {
      idempotency.set(tenantId, idemKey, { status: 201, body: responseBody });
    }
    return c.json(responseBody, 201);
  });

  // PATCH /v1/reservations/:id
  app.patch("/:id", async (c) => {
    const tenantId = c.get("tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await readJson(c);
    const patch = parseOrThrow(updateBodySchema, body, "body");
    const row = await service.update({ tenantId, id, patch });
    return c.json({ data: row });
  });

  // POST /v1/reservations/:id/cancel
  app.post("/:id/cancel", async (c) => {
    const tenantId = c.get("tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const row = await service.cancel({ tenantId, id });
    return c.json({ data: row });
  });

  return app;
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestError("JSON invalide", "invalid_json");
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.join(".") || label} : ${i.message}`)
    .join("; ");
  throw new BadRequestError(message, "validation_error");
}
