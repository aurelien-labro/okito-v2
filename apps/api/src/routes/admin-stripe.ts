import { type Database, schema } from "@okito/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { StripeAccountService } from "../services/stripe-account.js";

const uuidParam = z.string().uuid();
const connectSchema = z.object({ secretKey: z.string().min(10).max(255) });

/**
 * Connexion et gestion des comptes Stripe d'un tenant (encaissements, V3).
 * La clé secrète n'est jamais renvoyée (le service produit des SafeStripeAccount).
 */
export function adminStripeRoute(service: StripeAccountService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/stripe/:tenantId — comptes (sans la clé)
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.list(tenantId) });
  });

  // POST /v1/admin/stripe/:tenantId/connect — { secretKey }
  app.post("/:tenantId/connect", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const { secretKey } = parseOrThrow(connectSchema, body, "body");
    return c.json({ data: await service.connect(tenantId, secretKey) }, 201);
  });

  // PATCH /v1/admin/stripe/:tenantId/:id — pause / reprise
  app.patch("/:tenantId/:id", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const { status } = parseOrThrow(
      z.object({ status: z.enum(["active", "paused"]) }),
      body,
      "body",
    );
    return c.json({ data: await service.setStatus(tenantId, id, status) });
  });

  // DELETE /v1/admin/stripe/:tenantId/:id
  app.delete("/:tenantId/:id", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.remove(tenantId, id);
    return c.json({ data: { ok: true } });
  });

  return app;
}

/**
 * Agrégat des encaissements Stripe pour le dashboard.
 * Somme les montants des events `payment.received` du journal — pas de table
 * dédiée. "Aujourd'hui" = depuis minuit Europe/Paris (cohérent avec le brief).
 */
export function adminStripeAnalyticsRoute(db: Database) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/stripe-analytics/:tenantId — { today, last7Days } en centimes
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const now = new Date();
    const [today, last7Days] = await Promise.all([
      sumSince(db, tenantId, startOfParisDay(now)),
      sumSince(db, tenantId, new Date(now.getTime() - 7 * 24 * 3600_000)),
    ]);
    return c.json({ data: { todayCents: today, last7DaysCents: last7Days } });
  });

  return app;
}

async function sumSince(db: Database, tenantId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum((${schema.events.payload}->>'amountCents')::int), 0)::int`,
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.tenantId, tenantId),
        eq(schema.events.type, "payment.received"),
        gte(schema.events.createdAt, since),
      ),
    );
  return row?.total ?? 0;
}

/** Minuit Europe/Paris du jour courant, exprimé en Date UTC. */
function startOfParisDay(now: Date): Date {
  const parisDate = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const utcMidnight = new Date(`${parisDate}T00:00:00Z`);
  const offsetMs =
    new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" })).getTime() -
    new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(utcMidnight.getTime() - offsetMs);
}

function parseOrThrow<T>(schemaArg: z.ZodType<T>, value: unknown, label: string): T {
  const result = schemaArg.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.join(".") || label} : ${i.message}`)
    .join("; ");
  throw new BadRequestError(message, "validation_error");
}
