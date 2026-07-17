import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { voiceStreamToken } from "../services/voice/stream-session.js";
import { voiceTwimlRoute } from "./voice-twiml.js";

const SECRET = "secret-de-test-suffisamment-long";
const TENANT = "11111111-1111-1111-1111-111111111111";
const STREAM_URL = "wss://api.okito.app/v1/voice/stream";
const AUTH_TOKEN = "twilio-auth-token-test";
const BASE = "https://api.okito.app";

function sign(url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", AUTH_TOKEN).update(data, "utf8").digest("base64");
}

function post(
  app: ReturnType<typeof voiceTwimlRoute>,
  tenantId: string,
  headers?: Record<string, string>,
  body?: Record<string, string>,
) {
  const form = new URLSearchParams(body ?? {});
  return app.request(`/incoming/${tenantId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: form.toString(),
  });
}

describe("voiceTwimlRoute", () => {
  it("sans validation : renvoie la TwiML avec tenant + jeton HMAC", async () => {
    const app = voiceTwimlRoute(SECRET, STREAM_URL);
    const res = await post(app, TENANT);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain(`<Stream url="${STREAM_URL}">`);
    expect(xml).toContain(voiceStreamToken(SECRET, TENANT));
  });

  it("tenant non-UUID : 400", async () => {
    const app = voiceTwimlRoute(SECRET, STREAM_URL);
    const res = await post(app, "pas-un-uuid");
    expect(res.status).toBe(400);
  });

  it("validation active : signature Twilio correcte → 200", async () => {
    const app = voiceTwimlRoute(SECRET, STREAM_URL, {
      authToken: AUTH_TOKEN,
      publicBaseUrl: BASE,
    });
    const body = { CallSid: "CA123", From: "+33612345678" };
    const sig = sign(`${BASE}/v1/voice/incoming/${TENANT}`, body);
    const res = await post(app, TENANT, { "X-Twilio-Signature": sig }, body);
    expect(res.status).toBe(200);
  });

  it("validation active : signature absente ou forgée → 403", async () => {
    const app = voiceTwimlRoute(SECRET, STREAM_URL, {
      authToken: AUTH_TOKEN,
      publicBaseUrl: BASE,
    });
    const body = { CallSid: "CA123" };
    expect((await post(app, TENANT, undefined, body)).status).toBe(403);
    expect(
      (await post(app, TENANT, { "X-Twilio-Signature": "c2lnbmF0dXJlLWZvcmfDqWU=" }, body)).status,
    ).toBe(403);
  });
});
