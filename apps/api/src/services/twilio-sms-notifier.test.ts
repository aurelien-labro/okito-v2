import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwilioSmsNotifier } from "./twilio-sms-notifier.js";

describe("TwilioSmsNotifier", () => {
  const config = {
    accountSid: "ACxxxx",
    authToken: "tok_test",
    from: "+33756123456",
    endpoint: "https://api.twilio.test/Messages.json",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envoie un SMS via Twilio SANS préfixe whatsapp:", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ sid: "SM_sms_42" }), { status: 201 }),
    );
    const notifier = new TwilioSmsNotifier(config);

    const result = await notifier.send({
      tenantId: "t1",
      channel: "sms",
      to: "+33612345678",
      body: "Rappel: votre RDV demain à 14h",
    });

    expect(result).toEqual({
      delivered: true,
      provider: "twilio",
      externalId: "SM_sms_42",
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    const [_, init] = mockFetch.mock.calls[0] ?? [];
    const initObj = init as RequestInit;
    const params = new URLSearchParams(initObj.body as string);
    expect(params.get("From")).toBe("+33756123456");
    expect(params.get("To")).toBe("+33612345678");
    expect(params.get("From")).not.toMatch(/^whatsapp:/);
  });

  it("ne tente pas Twilio pour les canaux non-sms", async () => {
    const notifier = new TwilioSmsNotifier(config);
    const result = await notifier.send({
      tenantId: "t1",
      channel: "whatsapp",
      to: "+33612345678",
      body: "x",
    });
    expect(result.provider).toBe("logging");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejette les numéros non-E.164", async () => {
    const notifier = new TwilioSmsNotifier(config);
    const result = await notifier.send({
      tenantId: "t1",
      channel: "sms",
      to: "0612345678",
      body: "x",
    });
    expect(result.error).toBe("invalid phone");
    expect(fetch).not.toHaveBeenCalled();
  });
});
