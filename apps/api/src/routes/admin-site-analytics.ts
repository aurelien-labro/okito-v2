import { type Database, schema } from "@okito/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";

const uuidParam = z.string().uuid();

/**
 * Agrégats de visites site pour le dashboard (carte "Visites site").
 * Compte les événements `site.visit` du journal — pas de table dédiée.
 * "Aujourd'hui" = depuis minuit Europe/Paris (cohérent avec le brief de 8h).
 */
export function adminSiteAnalyticsRoute(db: Database) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/site-analytics/:tenantId — { today, last7Days }
  app.get("/:tenantId", async (c) => {
    const parsed = uuidParam.safeParse(c.req.param("tenantId"));
    if (!parsed.success) throw new BadRequestError("tenantId invalide", "validation_error");
    const tenantId = parsed.data;

    const now = new Date();
    const [today, last7Days] = await Promise.all([
      countVisitsSince(db, tenantId, startOfParisDay(now)),
      countVisitsSince(db, tenantId, new Date(now.getTime() - 7 * 24 * 3600_000)),
    ]);

    return c.json({ data: { today, last7Days } });
  });

  return app;
}

async function countVisitsSince(db: Database, tenantId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.tenantId, tenantId),
        eq(schema.events.type, "site.visit"),
        gte(schema.events.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

/** Minuit Europe/Paris du jour courant, exprimé en Date UTC. */
function startOfParisDay(now: Date): Date {
  const parisDate = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // "2026-07-05"
  // Décalage Paris : on prend minuit local via le truc classique "date en TZ".
  const utcMidnight = new Date(`${parisDate}T00:00:00Z`);
  const offsetMs =
    new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" })).getTime() -
    new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(utcMidnight.getTime() - offsetMs);
}
