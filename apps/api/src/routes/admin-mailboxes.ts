import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { MailboxService } from "../services/mailbox.js";

const uuidParam = z.string().uuid();

/** Connexion et gestion des boîtes Gmail d'un tenant (module Inbox V3). */
export function adminMailboxesRoute(service: MailboxService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/mailboxes/:tenantId — jamais de tokens dans la réponse
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await service.list(tenantId) });
  });

  // POST /v1/admin/mailboxes/:tenantId/connect — URL de consentement Google
  app.post("/:tenantId/connect", (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const { url } = service.buildAuthUrl(tenantId);
    return c.json({ data: { url } });
  });

  // PATCH /v1/admin/mailboxes/:tenantId/:id — pause / reprise
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

  // DELETE /v1/admin/mailboxes/:tenantId/:id
  app.delete("/:tenantId/:id", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await service.remove(tenantId, id);
    return c.json({ data: { ok: true } });
  });

  return app;
}

/**
 * Callback OAuth Google — public (Google y redirige le navigateur).
 * Monté sur /oauth/google/callback, hors middleware admin.
 */
export function googleOAuthCallbackRoute(service: MailboxService, appUrl: string) {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) {
      return c.text("Paramètres OAuth manquants", 400);
    }
    try {
      const mailbox = await service.handleCallback(code, state);
      // Retour au dashboard : la page Intégrations affichera la boîte connectée.
      return c.redirect(`${appUrl}/integrations?mailbox=${mailbox.id}`);
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
