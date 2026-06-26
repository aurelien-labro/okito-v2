import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResendNotifier } from "./resend-notifier.js";

describe("ResendNotifier", () => {
  const config = {
    apiKey: "re_test_key",
    from: "OKITO <bot@okito.test>",
    endpoint: "https://api.resend.test/emails",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envoie l'email via Resend quand le canal est email", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "evt_123" }), { status: 200 }),
    );
    const notifier = new ResendNotifier(config);

    const result = await notifier.send({
      tenantId: "t1",
      channel: "email",
      to: "client@example.com",
      subject: "Test",
      body: "Bonjour",
    });

    expect(result).toEqual({ delivered: true, provider: "resend", externalId: "evt_123" });
    expect(fetch).toHaveBeenCalledWith(
      config.endpoint,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_test_key" }),
      }),
    );
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    const init = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init).toBeDefined();
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      from: config.from,
      to: "client@example.com",
      subject: "Test",
      text: "Bonjour",
    });
  });

  it("ne tente pas Resend pour les canaux non-email (fallback log)", async () => {
    const notifier = new ResendNotifier(config);
    const result = await notifier.send({
      tenantId: "t1",
      channel: "whatsapp",
      to: "+33612345678",
      body: "Hello",
    });
    expect(result.provider).toBe("logging");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retourne delivered=false avec error sur HTTP non-2xx", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("invalid_from_address", { status: 422 }),
    );
    const notifier = new ResendNotifier(config);
    const result = await notifier.send({
      tenantId: "t1",
      channel: "email",
      to: "client@example.com",
      body: "Bonjour",
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toBe("HTTP 422");
  });

  it("rejette les adresses sans @ avant l'appel HTTP", async () => {
    const notifier = new ResendNotifier(config);
    const result = await notifier.send({
      tenantId: "t1",
      channel: "email",
      to: "pas-un-email",
      body: "x",
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toBe("invalid email");
    expect(fetch).not.toHaveBeenCalled();
  });
});
