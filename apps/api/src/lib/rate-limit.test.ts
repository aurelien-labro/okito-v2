import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit.js";

describe("RateLimiter", () => {
  it("autorise les hits sous la limite", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) {
      expect(rl.hit("k", 5, 1000).allowed).toBe(true);
    }
  });

  it("bloque au-delà de la limite avec retryAfterMs", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.hit("k", 5, 1000);
    const result = rl.hit("k", 5, 1000);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(1000);
    }
  });

  it("isole les clés (une clé bloquée n'affecte pas l'autre)", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.hit("user-a", 5, 1000);
    expect(rl.hit("user-a", 5, 1000).allowed).toBe(false);
    expect(rl.hit("user-b", 5, 1000).allowed).toBe(true);
  });

  it("autorise à nouveau après expiration de la fenêtre", async () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 3; i++) rl.hit("k", 3, 30);
    expect(rl.hit("k", 3, 30).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(rl.hit("k", 3, 30).allowed).toBe(true);
  });
});
