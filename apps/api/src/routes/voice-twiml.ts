import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/types.js";
import { voiceStreamToken } from "../services/voice/stream-session.js";

const uuidParam = z.string().uuid();

/**
 * Webhook Twilio "A call comes in" : renvoie la TwiML qui branche l'appel sur
 * notre WebSocket Media Streams, avec le tenant et son jeton HMAC en
 * paramètres custom (vérifiés au "start" du stream).
 *
 * Public par nature (Twilio n'envoie pas de JWT) ; le jeton lie l'appel au
 * tenant. Durcissement à venir : validation de la signature X-Twilio-Signature.
 */
export function voiceTwimlRoute(secret: string, streamUrl: string) {
  const app = new Hono<AppEnv>();

  app.post("/incoming/:tenantId", (c) => {
    const parsed = uuidParam.safeParse(c.req.param("tenantId"));
    if (!parsed.success) return c.text("tenant invalide", 400);
    const tenantId = parsed.data;
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
