import { reservationCoreSchema, reservationSourceSchema } from "@okito/shared/types";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import { IdempotencyCache } from "../lib/idempotency.js";
import type { AppEnv } from "../lib/types.js";
import type { AuditLogService } from "../services/audit-log.js";
import type { ReservationService } from "../services/reservation.js";

const uuidParam = z.string().uuid();
const dateQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createBodySchema = reservationCoreSchema.extend({
  source: reservationSourceSchema.optional(),
  assignedMemberId: z.string().uuid().nullable().optional(),
});
const updateBodySchema = reservationCoreSchema.partial().extend({
  assignedMemberId: z.string().uuid().nullable().optional(),
});

/** Cache global idempotency partagé entre toutes les routes /v1/reservations. */
const idempotency = new IdempotencyCache();

export function reservationsRoute(service: ReservationService, audit?: AuditLogService) {
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
    const { assignedMemberId, ...data } = parseOrThrow(createBodySchema, body, "body");
    const row = await service.create({ tenantId, data, assignedMemberId });
    // Le token portail brut ne quitte le serveur que par le lien de notification
    // envoyé au client. Il ne doit jamais transiter par la réponse HTTP, le cache
    // idempotency, ni l'audit log.
    const { accessToken: _token, ...safeRow } = row;
    const responseBody = { data: safeRow };

    if (idemKey) {
      idempotency.set(tenantId, idemKey, { status: 201, body: responseBody });
    }
    await safeAudit(audit, c, {
      action: "reservation.create",
      entityType: "reservation",
      entityId: row.id,
      tenantId,
      after: safeRow,
    });
    return c.json(responseBody, 201);
  });

  // PATCH /v1/reservations/:id
  app.patch("/:id", async (c) => {
    const tenantId = c.get("tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await readJson(c);
    const patch = parseOrThrow(updateBodySchema, body, "body");
    const before = await service.getById({ tenantId, id });
    const row = await service.update({ tenantId, id, patch });
    await safeAudit(audit, c, {
      action: "reservation.update",
      entityType: "reservation",
      entityId: id,
      tenantId,
      before,
      after: row,
    });
    return c.json({ data: row });
  });

  // POST /v1/reservations/:id/cancel
  app.post("/:id/cancel", async (c) => {
    const tenantId = c.get("tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const before = await service.getById({ tenantId, id });
    const row = await service.cancel({ tenantId, id });
    await safeAudit(audit, c, {
      action: "reservation.cancel",
      entityType: "reservation",
      entityId: id,
      tenantId,
      before,
      after: row,
    });
    return c.json({ data: row });
  });

  return app;
}

async function safeAudit(
  audit: AuditLogService | undefined,
  c: Context<AppEnv>,
  input: Omit<Parameters<AuditLogService["log"]>[0], "actorUserId" | "ip" | "userAgent">,
): Promise<void> {
  if (!audit) return;
  try {
    await audit.log({
      ...input,
      actorUserId: c.get("userId") ?? null,
      ip: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });
  } catch (err) {
    console.error("[audit_log] échec d'écriture :", err);
  }
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
