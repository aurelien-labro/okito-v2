import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "./stripe-webhook.js";

const SECRET = "whsec_test_secret";

function sign(body: string, ts: number = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

describe("verifyStripeSignature", () => {
  it("accepte une signature valide récente", () => {
    const body = '{"hello":"world"}';
    expect(verifyStripeSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejette une signature avec mauvaise clé", () => {
    const body = '{"hello":"world"}';
    const header = sign(body);
    expect(verifyStripeSignature(body, header, "whsec_wrong")).toBe(false);
  });

  it("rejette un body modifié après signature", () => {
    const header = sign('{"hello":"world"}');
    expect(verifyStripeSignature('{"hello":"modified"}', header, SECRET)).toBe(false);
  });

  it("rejette une timestamp en dehors de la tolérance (replay attack)", () => {
    const oldTs = Math.floor(Date.now() / 1000) - 600; // -10 min
    const body = "{}";
    expect(verifyStripeSignature(body, sign(body, oldTs), SECRET, 300)).toBe(false);
  });

  it("rejette un header malformé", () => {
    expect(verifyStripeSignature("{}", "garbage", SECRET)).toBe(false);
    expect(verifyStripeSignature("{}", "t=123", SECRET)).toBe(false);
    expect(verifyStripeSignature("{}", "v1=abc", SECRET)).toBe(false);
  });
});
