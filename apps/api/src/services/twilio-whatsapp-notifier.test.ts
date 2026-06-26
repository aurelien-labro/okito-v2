import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwilioWhatsAppNotifier } from "./twilio-whatsapp-notifier.js";

describe("TwilioWhatsAppNotifier", () => {
  const config = {
    accountSid: "ACxxxx",
    authToken: "tok_test",
    from: "+14155238886",
    endpoint: "https://api.twilio.test/Messages.json",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envoie un WhatsApp via Twilio avec basic auth et préfixe whatsapp:", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ sid: "SM_test_123" }), { status: 201 }),
    );
    const notifier = new TwilioWhatsAppNotifier(config);

    const result = await notifier.send({
      tenantId: "t1",
      channel: "whatsapp",
      to: "+33612345678",
      body: "Confirmation OKITO",
    });

    expect(result).toEqual({
      delivered: true,
      provider: "twilio",
      externalId: "SM_test_123",
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = mockFetch.mock.calls[0] ?? [];
    expect(url).toBe(config.endpoint);

    const expectedAuth = `Basic ${Buffer.from("ACxxxx:tok_test").toString("base64")}`;
    const initObj = init as RequestInit;
    const headers = initObj.headers as Record<string, string>;
    expect(headers.Authorization).toBe(expectedAuth);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(initObj.body as string);
    expect(params.get("From")).toBe("whatsapp:+14155238886");
    expect(params.get("To")).toBe("whatsapp:+33612345678");
    expect(params.get("Body")).toBe("Confirmation OKITO");
  });

  it("ne tente pas Twilio pour les canaux non-whatsapp (fallback log)", async () => {
    const notifier = new TwilioWhatsAppNotifier(config);
    const result = await notifier.send({
      tenantId: "t1",
      channel: "email",
      to: "client@example.com",
      body: "Hello",
    });
    expect(result.provider).toBe("logging");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejette les numéros sans + (non E.164) avant l'appel HTTP", async () => {
    const notifier = new TwilioWhatsAppNotifier(config);
    const result = await notifier.send({
      tenantId: "t1",
      channel: "whatsapp",
      to: "0612345678",
      body: "x",
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toBe("invalid phone");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retourne delivered=false sur HTTP non-2xx", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("not authorized", { status: 401 }),
    );
    const notifier = new TwilioWhatsAppNotifier(config);
    const result = await notifier.send({
      tenantId: "t1",
      channel: "whatsapp",
      to: "+33612345678",
      body: "x",
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toBe("HTTP 401");
  });
});
