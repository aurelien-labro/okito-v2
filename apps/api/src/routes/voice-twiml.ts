import { Hono } from "hono";
import { z } from "zod";
import { validateTwilioSignature } from "../lib/twilio-signature.js";
import type { AppEnv } from "../lib/types.js";
import { voiceStreamToken } from "../services/voice/stream-session.js";

const uuidParam = z.string().uuid();

export interface TwilioWebhookAuth {
  /** Auth token du compte Twilio (clé de la signature). */
  authToken: string;
  /** Base publique de l'API telle que Twilio la voit (ex: https://api.okito.app). */
  publicBaseUrl: string;
}

/**
 * Webhook Twilio "A call comes in" : renvoie la TwiML qui branche l'appel sur
 * notre WebSocket Media Streams, avec le tenant et son jeton HMAC en
 * paramètres custom (vérifiés au "start" du stream).
 *
 * Public par nature (Twilio n'envoie pas de JWT) ; deux verrous :
 * la signature X-Twilio-Signature (si `twilioAuth` fourni) prouve que la
 * requête vient bien de Twilio, et le jeton HMAC lie l'appel au tenant.
 */
export function voiceTwimlRoute(secret: string, streamUrl: string, twilioAuth?: TwilioWebhookAuth) {
  const app = new Hono<AppEnv>();

  app.post("/incoming/:tenantId", async (c) => {
    const parsed = uuidParam.safeParse(c.req.param("tenantId"));
    if (!parsed.success) return c.text("tenant invalide", 400);
    const tenantId = parsed.data;

    if (twilioAuth) {
      const signature = c.req.header("x-twilio-signature") ?? "";
      const url = `${twilioAuth.publicBaseUrl.replace(/\/$/, "")}/v1/voice/incoming/${tenantId}`;
      const form = await c.req.parseBody();
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(form)) {
        if (typeof value === "string") params[key] = value;
      }
      if (!validateTwilioSignature({ authToken: twilioAuth.authToken, url, params, signature })) {
        return c.text("signature Twilio invalide", 403);
      }
    }

    const token = voiceStreamToken(secret, tenantId);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="tenantId" value="${tenantId}" />
      <Parameter name="token" value="${token}" />
    </Stream>
  </Connect>
</Response>`;
    return c.body(twiml, 200, { "Content-Type": "text/xml" });
  });

  return app;
}
