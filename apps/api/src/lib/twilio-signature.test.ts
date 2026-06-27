import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateTwilioSignature } from "./twilio-signature.js";

function expectedSignature(authToken: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, key) => `${acc}${key}${params[key] ?? ""}`, url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

describe("validateTwilioSignature", () => {
  const authToken = "test_token_xyz";
  const url = "https://api.okito.app/v1/webhooks/whatsapp";
  const params = {
    From: "whatsapp:+33612345678",
    To: "whatsapp:+14155238886",
    Body: "Bonjour",
    MessageSid: "SM_test",
  };

  it("accepte une signature valide", () => {
    const sig = expectedSignature(authToken, url, params);
    expect(validateTwilioSignature({ authToken, url, params, signature: sig })).toBe(true);
  });

  it("refuse une signature falsifiée", () => {
    expect(
      validateTwilioSignature({ authToken, url, params, signature: "invalid_signature_b64" }),
    ).toBe(false);
  });

  it("refuse si signature vide", () => {
    expect(validateTwilioSignature({ authToken, url, params, signature: "" })).toBe(false);
  });

  it("refuse si un paramètre a été altéré", () => {
    const sig = expectedSignature(authToken, url, params);
    const tampered = { ...params, Body: "Message modifié" };
    expect(validateTwilioSignature({ authToken, url, params: tampered, signature: sig })).toBe(
      false,
    );
  });

  it("refuse si l'URL ne correspond pas (replay attack vers autre endpoint)", () => {
    const sig = expectedSignature(authToken, url, params);
    expect(
      validateTwilioSignature({
        authToken,
        url: "https://api.okito.app/v1/webhooks/voice",
        params,
        signature: sig,
      }),
    ).toBe(false);
  });
});
