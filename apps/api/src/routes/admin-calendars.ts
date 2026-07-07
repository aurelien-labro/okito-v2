import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { GoogleCalendarService } from "../services/google-calendar.js";

const uuidParam = z.string().uuid();

/**
 * Connexion et gestion des agendas Google d'un tenant (import créneaux, V3).
 * Les tokens ne sortent jamais (le service produit des SafeCalendar).
 */
export function adminCalendarsRoute(service: GoogleCalendarService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/calendars/:tenantId — agendas (sans tokens)
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.list(tenantId) });
  });

  // POST /v1/admin/calendars/:tenantId/connect — URL de consentement Google
  app.post("/:tenantId/connect", (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const { url } = service.buildAuthUrl(tenantId);
    return c.json({ data: { url } });
  });

  // PATCH /v1/admin/calendars/:tenantId/:id — pause / reprise
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

  // DELETE /v1/admin/calendars/:tenantId/:id
  app.delete("/:tenantId/:id", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.remove(tenantId, id);
    return c.json({ data: { ok: true } });
  });

  return app;
}

/**
 * Callback OAuth Google Calendar — public (Google y redirige le navigateur).
 * Monté sur /oauth/google-calendar/callback, hors middleware admin.
 */
export function googleCalendarCallbackRoute(service: GoogleCalendarService, appUrl: string) {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return c.text("Paramètres OAuth manquants", 400);
    try {
      const cal = await service.handleCallback(code, state);
      return c.redirect(`${appUrl}/integrations?calendar=${cal.id}`);
    } catch (err) {
      if (err instanceof HttpError) return c.text(err.message, err.status as 400);
      throw err;
    }
  });

  return app;
}

function parseOrThrow<T>(schemaArg: z.ZodType<T>, value: unknown, label: string): T {
  const result = schemaArg.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.join(".") || label} : ${i.message}`)
    .join("; ");
  throw new BadRequestError(message, "validation_error");
}
