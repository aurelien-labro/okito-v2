import { Hono } from "hono";
import { z } from "zod";
import { buildICalendar, verifyFeed } from "../lib/ical.js";
import type { AppEnv } from "../lib/types.js";
import type { ReservationService } from "../services/reservation.js";
import type { TenantService } from "../services/tenant.js";

const uuidParam = z.string().uuid();

export interface IcalFeedDeps {
  reservation: ReservationService;
  tenant: TenantService;
  secret: string;
}

/** Fenêtre par défaut d'un abonnement : 7 jours passés → 60 jours futurs. */
function defaultRange(): { from: string; to: string } {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(now - 7 * 86_400_000), to: iso(now + 60 * 86_400_000) };
}

/**
 * Flux iCal public signé — monté sur /feed. Pas de JWT (les apps calendrier
 * n'en envoient pas) : l'accès est protégé par la signature HMAC de l'URL.
 */
export function icalFeedRoute(deps: IcalFeedDeps) {
  const app = new Hono<AppEnv>();

  // GET /feed/:tenantId.ics?sig=...
  app.get("/:file", async (c) => {
    const file = c.req.param("file");
    const tenantId = file.replace(/\.ics$/, "");
    const sig = c.req.query("sig") ?? "";
    if (!uuidParam.safeParse(tenantId).success || !verifyFeed(tenantId, sig, deps.secret)) {
      return c.json({ error: { code: "invalid_feed", message: "Flux introuvable" } }, 404);
    }

    const tenant = await deps.tenant.getById(tenantId);
    const { from, to } = defaultRange();
    const reservations = await deps.reservation.listBetween({ tenantId, from, to });
    const body = buildICalendar({ tenantName: tenant.name, tenantId, reservations });

    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${tenantId}.ics"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  });

  return app;
}
