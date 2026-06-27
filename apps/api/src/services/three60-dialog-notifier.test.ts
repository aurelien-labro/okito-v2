import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Three60DialogNotifier } from "./three60-dialog-notifier.js";

describe("Three60DialogNotifier", () => {
  const config = {
    apiKey: "D3-test-key",
    endpoint: "https://waba-v2.360dialog.test/messages",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envoie un WhatsApp via 360dialog avec D360-API-KEY et payload Meta Cloud", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [{ id: "wamid.test_123" }] }), { status: 200 }),
    );
    const notifier = new Three60DialogNotifier(config);

    const result = await notifier.send({
      tenantId: "t1",
      channel: "whatsapp",
      to: "+33612345678",
      body: "Confirmation OKITO",
    });

    expect(result).toEqual({
      delivered: true,
      provider: "360dialog",
      externalId: "wamid.test_123",
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = mockFetch.mock.calls[0] ?? [];
    expect(url).toBe(config.endpoint);

    const initObj = init as RequestInit;
    const headers = initObj.headers as Record<string, string>;
    expect(headers["D360-API-KEY"]).toBe("D3-test-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(initObj.body as string);
    expect(body.messaging_product).toBe("whatsapp");
    // L'API attend le numéro sans '+'
    expect(body.to).toBe("33612345678");
    expect(body.type).toBe("text");
    expect(body.text.body).toBe("Confirmation OKITO");
  });

  it("ne tente pas 360dialog pour les canaux non-whatsapp (fallback log)", async () => {
    const notifier = new Three60DialogNotifier(config);
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
    const notifier = new Three60DialogNotifier(config);
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
      new Response("invalid_api_key", { status: 401 }),
    );
    const notifier = new Three60DialogNotifier(config);
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
