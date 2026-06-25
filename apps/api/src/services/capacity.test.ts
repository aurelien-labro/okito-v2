import type { Database } from "@okito/db";
import { describe, expect, it, vi } from "vitest";
import { CapacityService } from "./capacity.js";

function makeDb(executeResult: unknown) {
  const execute = vi.fn().mockResolvedValue(executeResult);
  return { db: { execute } as unknown as Database, execute };
}

const baseArgs = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  date: "2026-06-28",
  heure: "20:00",
  couverts: 4,
  capacityMax: 50,
};

describe("CapacityService.check", () => {
  it("créneau peu occupé → available=true, remaining calculé", async () => {
    const { db } = makeDb([{ occupied: 20 }]);
    const svc = new CapacityService(db);
    const result = await svc.check(baseArgs);
    expect(result.available).toBe(true);
    expect(result.occupied).toBe(20);
    expect(result.remaining).toBe(30);
  });

  it("créneau plein → available=false", async () => {
    const { db } = makeDb([{ occupied: 48 }]);
    const svc = new CapacityService(db);
    const result = await svc.check({ ...baseArgs, couverts: 4 });
    expect(result.available).toBe(false);
    expect(result.remaining).toBe(2);
  });

  it("occupied = null → traité comme 0", async () => {
    const { db } = makeDb([{ occupied: null }]);
    const svc = new CapacityService(db);
    const result = await svc.check(baseArgs);
    expect(result.occupied).toBe(0);
    expect(result.available).toBe(true);
  });

  it("occupied retourné en string (postgres-js parfois) → coercé en number", async () => {
    const { db } = makeDb([{ occupied: "42" }]);
    const svc = new CapacityService(db);
    const result = await svc.check(baseArgs);
    expect(result.occupied).toBe(42);
    expect(result.remaining).toBe(8);
  });
});
