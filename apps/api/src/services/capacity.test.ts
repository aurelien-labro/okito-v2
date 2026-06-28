import type { Database, ServiceWindow, Tenant } from "@okito/db";
import { describe, expect, it, vi } from "vitest";
import { CapacityService, checkServiceWindow } from "./capacity.js";

function makeDb(executeResult: unknown, tables: Array<{ id: string; capacity: number }> = []) {
  const execute = vi.fn().mockResolvedValue(executeResult);
  // Stub minimaliste de db.select().from().where() utilisé par le mode tables.
  // Par défaut renvoie aucune table → mode couverts (legacy).
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(tables),
    }),
  });
  return { db: { execute, select } as unknown as Database, execute, select };
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

describe("checkServiceWindow", () => {
  function tenantWithServices(services: ServiceWindow[]): Tenant {
    return {
      services,
      serviceLunchStart: "12:00",
      serviceLunchEnd: "14:30",
      serviceDinnerStart: "19:00",
      serviceDinnerEnd: "22:00",
    } as Tenant;
  }

  it("services JSONB prioritaires sur les colonnes legacy", () => {
    const tenant = tenantWithServices([{ label: "Check-in", start: "08:00", end: "11:00" }]);
    const inService = checkServiceWindow(tenant, "09:00");
    expect(inService).toEqual({ inService: true, service: "Check-in" });
    const out = checkServiceWindow(tenant, "13:00");
    expect(out.inService).toBe(false);
    expect(out.suggestion).toContain("08h00");
  });

  it("services vide → fallback sur lunch/dinner legacy", () => {
    const tenant = tenantWithServices([]);
    expect(checkServiceWindow(tenant, "13:00")).toEqual({ inService: true, service: "déjeuner" });
    expect(checkServiceWindow(tenant, "20:00")).toEqual({ inService: true, service: "dîner" });
  });

  it("plusieurs services JSONB, suggestion les liste tous", () => {
    const tenant = tenantWithServices([
      { label: "Matin", start: "09:00", end: "12:00" },
      { label: "Aprèm", start: "14:00", end: "18:00" },
    ]);
    const out = checkServiceWindow(tenant, "13:00");
    expect(out.inService).toBe(false);
    expect(out.suggestion).toContain("09h00 (Matin)");
    expect(out.suggestion).toContain("14h00 (Aprèm)");
  });
});
