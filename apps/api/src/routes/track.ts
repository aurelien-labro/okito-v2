import type { Database } from "@okito/db";
import { Hono } from "hono";
import { BadRequestError, HttpError, NotFoundError } from "../lib/errors.js";
import { RateLimiter } from "../lib/rate-limit.js";

/** Le strict besoin du tracker : journaliser un event de type libre. */
export interface EventPublisher {
  publish(tenantId: string, type: string, payload: Record<string, unknown>, source?: string): void;
}

/**
 * Analytics site maison — endpoint public d'ingestion des visites.
 *
 * Le site du commerçant charge le script tracker (GET /script.js) qui envoie
 * un beacon par page vue. Chaque visite devient un événement `site.visit`
 * sur le bus : le journal EST le stockage, pas de table dédiée. Aucune PII :
 * ni IP ni user-agent persistés, juste le chemin, le referrer et un
 * sessionId opaque généré côté navigateur.
 *
 * Même modèle de confiance que le widget : tenantId public dans le path,
 * rate limit par session, CORS permissif pour le MVP.
 */

const trackLimiter = new RateLimiter();
const TRACK_LIMIT = 60;
const TRACK_WINDOW_MS = 60_000;

export function trackRoute(db: Database, bus: EventPublisher, publicApiUrl?: string) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  app.options("/:tenantId", (c) => c.body(null, 204, corsHeaders(c.req.header("origin"))));

  // GET /v1/track/:tenantId/script.js — tracker à intégrer sur le site.
  app.get("/:tenantId/script.js", (c) => {
    const tenantId = c.req.param("tenantId");
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
      throw new BadRequestError("tenantId invalide", "invalid_tenant");
    }
    const base = (publicApiUrl ?? new URL(c.req.url).origin).replace(/\/$/, "");
    const js = buildTrackerScript(base, tenantId);
    return c.text(js, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    });
  });

  // POST /v1/track/:tenantId — une page vue.
  app.post("/:tenantId", async (c) => {
    const origin = c.req.header("origin");
    const tenantId = c.req.param("tenantId");
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
      throw new BadRequestError("tenantId invalide", "invalid_tenant");
    }

    let body: { path?: string; referrer?: string; sessionId?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      throw new BadRequestError("JSON invalide", "invalid_json");
    }
    const sessionId = (body.sessionId ?? "").trim().slice(0, 64);
    const path = (body.path ?? "/").trim().slice(0, 500);
    const referrer = (body.referrer ?? "").trim().slice(0, 500);
    if (!sessionId) throw new BadRequestError("sessionId requis", "missing_field");

    const rate = trackLimiter.hit(`track:${tenantId}:${sessionId}`, TRACK_LIMIT, TRACK_WINDOW_MS);
    if (!rate.allowed) {
      return c.json({ error: { code: "rate_limited", message: "Trop de hits" } }, 429, {
        ...corsHeaders(origin),
        "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
      });
    }

    // Un tenantId inconnu ne doit pas polluer le journal.
    const tenant = await db.query.tenants.findFirst({
      columns: { id: true },
      where: (t, { eq }) => eq(t.id, tenantId),
    });
    if (!tenant) throw new NotFoundError("Tenant introuvable");

    bus.publish(tenantId, "site.visit", { path, referrer: referrer || null, sessionId }, "site");
    return c.body(null, 204, corsHeaders(origin));
  });

  return app;
}

function buildTrackerScript(base: string, tenantId: string): string {
  // Script minimal : un sessionId localStorage + un beacon par chargement de page.
  return `(function(){
try{
var k="okito_sid",s;
try{s=localStorage.getItem(k);if(!s){s=Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem(k,s);}}catch(e){s="anon";}
var p=JSON.stringify({sessionId:s,path:location.pathname,referrer:document.referrer||""});
var u="${base}/v1/track/${tenantId}";
if(navigator.sendBeacon){navigator.sendBeacon(u,new Blob([p],{type:"application/json"}));}
else{fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:p,keepalive:true});}
}catch(e){}
})();
`;
}

function corsHeaders(origin?: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
