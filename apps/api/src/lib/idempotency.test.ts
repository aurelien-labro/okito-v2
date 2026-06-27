import { describe, expect, it } from "vitest";
import { IdempotencyCache } from "./idempotency.js";

describe("IdempotencyCache", () => {
  it("retourne la valeur cachée pour la même paire (tenantId, key)", () => {
    const cache = new IdempotencyCache();
    cache.set("t1", "key-abc", { status: 201, body: { id: 1 } });
    expect(cache.get("t1", "key-abc")).toEqual({ status: 201, body: { id: 1 } });
  });

  it("isole les tenants (key identique mais tenants différents)", () => {
    const cache = new IdempotencyCache();
    cache.set("t1", "key-abc", { status: 201, body: { tenant: "t1" } });
    expect(cache.get("t2", "key-abc")).toBeNull();
  });

  it("retourne null pour une clé absente", () => {
    const cache = new IdempotencyCache();
    expect(cache.get("t1", "absent")).toBeNull();
  });

  it("expire les entrées passé le TTL", async () => {
    const cache = new IdempotencyCache({ ttlMs: 10 });
    cache.set("t1", "k", { status: 201, body: {} });
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get("t1", "k")).toBeNull();
  });

  it("évince la plus ancienne entrée quand maxSize atteint", () => {
    const cache = new IdempotencyCache({ maxSize: 2 });
    cache.set("t1", "a", { status: 201, body: { v: 1 } });
    cache.set("t1", "b", { status: 201, body: { v: 2 } });
    cache.set("t1", "c", { status: 201, body: { v: 3 } });
    expect(cache.get("t1", "a")).toBeNull(); // évincée
    expect(cache.get("t1", "b")).not.toBeNull();
    expect(cache.get("t1", "c")).not.toBeNull();
  });
});
