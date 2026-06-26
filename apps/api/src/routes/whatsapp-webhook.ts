import type { Database } from "@okito/db";
import { Hono } from "hono";
import { BadRequestError, HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { validateTwilioSignature } from "../lib/twilio-signature.js";
import type { ChatService } from "../services/chat.js";

/**
 * Webhook entrant WhatsApp.
 *
 * Format Twilio (form-urlencoded) :
 *   From=whatsapp:+33600000000 To=whatsapp:+14155238886 Body=Salut...
 * Format 360dialog (JSON) :
 *   { messages: [{ from, type: "text", text: { body }, ... }],
 *     metadata: { phone_number_id, display_phone_number } }
 *
 * On extrait : `to` (numéro WhatsApp Business → lookup tenant), `from` (sessionKey),
 * `body` (message). On délègue ensuite à ChatService comme n'importe quel autre canal.
 *
 * Réponse :
 * - Twilio : TwiML XML pour répondre dans le même appel.
 * - 360dialog : 200 OK (la réponse est envoyée séparément via leur API).
 */

interface ParsedInbound {
  toNumber: string;
  fromNumber: string;
  body: string;
  provider: "twilio" | "360dialog";
}

export function whatsappWebhookRoute(deps: {
  chat: ChatService;
  db: Database;
  /** Si fourni, valide la signature X-Twilio-Signature des webhooks Twilio inbound. */
  twilioAuthToken?: string;
}) {
  const app = new Hono();

  app.post("/", async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    let parsed: ParsedInbound;
    let twilioForm: Record<string, string> | null = null;

    if (contentType.includes("application/json")) {
      const body = await c.req.json().catch(() => null);
      const extracted = parse360Dialog(body);
      if (!extracted) {
        // 360dialog envoie aussi des "status" events (delivery, read) — on les ignore.
        return c.json({ ok: true, skipped: "non-text event" });
      }
      parsed = extracted;
    } else {
      const form = await c.req.parseBody().catch(() => null);
      const extracted = parseTwilio(form);
      if (!extracted) throw new BadRequestError("Format webhook inconnu", "unknown_format");
      parsed = extracted;
      twilioForm = stringifyForm(form);
    }

    // Validation signature Twilio si activée (TWILIO_VALIDATE_WEBHOOK=true en prod).
    if (deps.twilioAuthToken && parsed.provider === "twilio" && twilioForm) {
      const signature = c.req.header("x-twilio-signature") ?? "";
      const ok = validateTwilioSignature({
        authToken: deps.twilioAuthToken,
        url: c.req.url,
        params: twilioForm,
        signature,
      });
      if (!ok) {
        logger.warn(
          { from: parsed.fromNumber, to: parsed.toNumber },
          "whatsapp inbound: signature Twilio invalide — requête rejetée",
        );
        throw new HttpError(401, "invalid_signature", "Signature invalide");
      }
    }

    const tenantRoute = await deps.db.query.tenantPhoneRoutes.findFirst({
      where: (r, { and: a, eq: e }) =>
        a(e(r.phoneNumber, parsed.toNumber), e(r.channel, "whatsapp")),
    });

    if (!tenantRoute) {
      logger.warn({ to: parsed.toNumber }, "whatsapp inbound: no tenant route");
      return c.text(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, 404, {
        "Content-Type": "application/xml",
      });
    }

    logger.info(
      { tenantId: tenantRoute.tenantId, from: parsed.fromNumber, provider: parsed.provider },
      "whatsapp inbound",
    );

    const response = await deps.chat.handle({
      tenantId: tenantRoute.tenantId,
      channel: "whatsapp",
      sessionKey: parsed.fromNumber,
      message: parsed.body,
    });

    if (parsed.provider === "twilio") {
      const escaped = response.reply
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return c.text(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
        200,
        { "Content-Type": "application/xml" },
      );
    }

    // 360dialog : 200 OK suffit. Le notifier enverra la réponse via leur API.
    return c.json({ ok: true, reply: response.reply });
  });

  return app;
}

function stringifyForm(form: Record<string, unknown> | null): Record<string, string> {
  if (!form) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function parseTwilio(form: Record<string, unknown> | null): ParsedInbound | null {
  if (!form) return null;
  const from = typeof form.From === "string" ? form.From : null;
  const to = typeof form.To === "string" ? form.To : null;
  const body = typeof form.Body === "string" ? form.Body.trim() : null;
  if (!from || !to || !body) return null;
  return {
    toNumber: normalizeWhatsAppNumber(to),
    fromNumber: normalizeWhatsAppNumber(from),
    body,
    provider: "twilio",
  };
}

function parse360Dialog(payload: unknown): ParsedInbound | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  // 360dialog Cloud API: { messages: [...], metadata: {...} }
  const messages = Array.isArray(p.messages) ? p.messages : null;
  const meta = (p.metadata ?? null) as Record<string, unknown> | null;
  if (!messages || !meta) return null;

  const first = messages[0] as Record<string, unknown> | undefined;
  if (!first || first.type !== "text") return null;

  const text = (first.text ?? {}) as Record<string, unknown>;
  const body = typeof text.body === "string" ? text.body.trim() : null;
  const from = typeof first.from === "string" ? first.from : null;
  const to = typeof meta.display_phone_number === "string" ? meta.display_phone_number : null;
  if (!from || !to || !body) return null;

  return {
    toNumber: normalizeE164(to),
    fromNumber: normalizeE164(from),
    body,
    provider: "360dialog",
  };
}

/** "whatsapp:+33600000000" → "+33600000000" */
function normalizeWhatsAppNumber(raw: string): string {
  return normalizeE164(raw.replace(/^whatsapp:/i, "").trim());
}

function normalizeE164(raw: string): string {
  const cleaned = raw.replace(/[\s.-]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith("0") && cleaned.length === 10) return `+33${cleaned.slice(1)}`;
  return cleaned;
}
