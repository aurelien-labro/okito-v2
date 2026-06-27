import { Hono } from "hono";
import { BadRequestError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { RateLimiter } from "../lib/rate-limit.js";
import type { ChatService } from "../services/chat.js";

/**
 * Endpoint public pour le widget JS embarquable.
 *
 * Pas de JWT Supabase : un site marchand qui intègre le widget ne peut pas
 * générer de token utilisateur. On identifie via :
 *   - tenantId dans le path
 *   - sessionId généré par le widget (UUID local stocké en localStorage)
 *   - origin check (whitelist configurée côté tenant) — à implémenter
 *   - rate limit par sessionId (30 msg/min, plus que WhatsApp parce que web)
 *
 * Pour le MVP on accepte tout origin si NODE_ENV !== production. En prod,
 * vérifier le Origin header contre tenant.allowedOrigins (à ajouter au schema).
 */

const widgetLimiter = new RateLimiter();
const WIDGET_LIMIT = 30;
const WIDGET_WINDOW_MS = 60_000;

export function widgetRoute(service: ChatService) {
  const app = new Hono();

  app.options("/chat/:tenantId", (c) => {
    return c.body(null, 204, corsHeaders(c.req.header("origin")));
  });

  app.post("/chat/:tenantId", async (c) => {
    const origin = c.req.header("origin");
    const tenantId = c.req.param("tenantId");
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
      throw new BadRequestError("tenantId invalide", "invalid_tenant");
    }

    let body: { sessionId?: string; message?: string };
    try {
      body = (await c.req.json()) as { sessionId?: string; message?: string };
    } catch {
      throw new BadRequestError("JSON invalide", "invalid_json");
    }
    const sessionId = (body.sessionId ?? "").trim();
    const message = (body.message ?? "").trim();
    if (!sessionId || !message) {
      throw new BadRequestError("sessionId et message requis", "missing_field");
    }

    // Rate limit par sessionId — protège même si le sessionId change pas.
    const rate = widgetLimiter.hit(`widget:${sessionId}`, WIDGET_LIMIT, WIDGET_WINDOW_MS);
    if (!rate.allowed) {
      return c.json(
        { error: { code: "rate_limited", message: "Trop de messages, ralentissez" } },
        429,
        {
          ...corsHeaders(origin),
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
        },
      );
    }

    logger.info({ tenantId, sessionId, msgLen: message.length }, "widget chat");

    const result = await service.handle({
      tenantId,
      channel: "web_widget",
      sessionKey: `widget-${sessionId}`,
      message,
    });

    return c.json({ reply: result.reply }, 200, corsHeaders(origin));
  });

  return app;
}

/**
 * CORS permissif pour le MVP — n'importe quel site peut appeler. À durcir en
 * prod : whitelist par tenant via DB.
 */
function corsHeaders(origin?: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
