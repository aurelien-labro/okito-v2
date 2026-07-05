import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { ImapMailboxService } from "../services/imap-mailbox.js";
import type { MailboxService } from "../services/mailbox.js";
import type { MicrosoftMailboxService } from "../services/microsoft-mailbox.js";

const uuidParam = z.string().uuid();

const imapConnectSchema = z.object({
  provider: z.enum(["imap", "yahoo"]),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: z.string().min(1).max(255),
  password: z.string().min(1).max(1024),
});

/**
 * Connexion et gestion des boîtes email d'un tenant (module Inbox V3).
 * Gmail (OAuth) et IMAP/Yahoo (identifiants chiffrés) sont indépendants :
 * chaque service est optionnel selon la config de l'instance.
 */
export function adminMailboxesRoute(
  gmail?: MailboxService,
  imap?: ImapMailboxService,
  microsoft?: MicrosoftMailboxService,
) {
  const app = new Hono<AppEnv>();
  const anyService = gmail ?? imap;

  // GET /v1/admin/mailboxes/:tenantId — jamais de tokens ni mot de passe dans la réponse
  app.get("/:tenantId", async (c) => {
    if (!anyService) throw new BadRequestError("Aucun provider email configuré");
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    return c.json({ data: await anyService.list(tenantId) });
  });

  // POST /v1/admin/mailboxes/:tenantId/connect — URL de consentement Google
  app.post("/:tenantId/connect", (c) => {
    if (!gmail) {
      throw new BadRequestError("OAuth Google non configuré", "gmail_unavailable");
    }
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const { url } = gmail.buildAuthUrl(tenantId);
    return c.json({ data: { url } });
  });

  // POST /v1/admin/mailboxes/:tenantId/connect-outlook — URL de consentement Microsoft
  app.post("/:tenantId/connect-outlook", (c) => {
    if (!microsoft) {
      throw new BadRequestError(
        "OAuth Microsoft non configuré (variables MICROSOFT_* absentes)",
        "outlook_unavailable",
      );
    }
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const { url } = microsoft.buildAuthUrl(tenantId);
    return c.json({ data: { url } });
  });

  // POST /v1/admin/mailboxes/:tenantId/imap — connexion IMAP/Yahoo par identifiants
  app.post("/:tenantId/imap", async (c) => {
    if (!imap) {
      throw new BadRequestError(
        "Boîtes IMAP non configurées (MAILBOX_ENC_KEY absente)",
        "imap_unavailable",
      );
    }
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const input = parseOrThrow(imapConnectSchema, body, "body");
    return c.json({ data: await imap.addMailbox(tenantId, input) }, 201);
  });

  // PATCH /v1/admin/mailboxes/:tenantId/:id — pause / reprise
  app.patch("/:tenantId/:id", async (c) => {
    if (!anyService) throw new BadRequestError("Aucun provider email configuré");
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
    return c.json({ data: await anyService.setStatus(tenantId, id, status) });
  });

  // DELETE /v1/admin/mailboxes/:tenantId/:id
  app.delete("/:tenantId/:id", async (c) => {
    if (!anyService) throw new BadRequestError("Aucun provider email configuré");
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    await anyService.remove(tenantId, id);
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

/**
 * Callback OAuth Microsoft — public (Microsoft y redirige le navigateur).
 * Monté sur /oauth/microsoft/callback, hors middleware admin.
 */
export function microsoftOAuthCallbackRoute(service: MicrosoftMailboxService, appUrl: string) {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) {
      return c.text("Paramètres OAuth manquants", 400);
    }
    try {
      const mailbox = await service.handleCallback(code, state);
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
