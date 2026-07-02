import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { ServiceCatalogService } from "./service-catalog.js";

describe("ServiceCatalogService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let svc: ServiceCatalogService;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    svc = new ServiceCatalogService(ctx.db);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "salon-test", name: "Salon Test" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("create + list : tri par display_order puis nom, inactives exclues par défaut", async () => {
    await svc.create({ tenantId, name: "Vidange", durationMinutes: 60, displayOrder: 2 });
    await svc.create({ tenantId, name: "Coupe homme", durationMinutes: 30, displayOrder: 1 });
    const inactive = await svc.create({ tenantId, name: "Ancien soin", durationMinutes: 45 });
    await svc.update(inactive.id, { active: false });

    const actives = await svc.listByTenant(tenantId);
    expect(actives.map((s) => s.name)).toEqual(["Coupe homme", "Vidange"]);

    const all = await svc.listByTenant(tenantId, true);
    expect(all).toHaveLength(3);
  });

  it("defaults : 60 min, EUR, custom_fields vide", async () => {
    const row = await svc.create({ tenantId, name: "Consultation" });
    expect(row.durationMinutes).toBe(60);
    expect(row.currency).toBe("EUR");
    expect(row.priceCents).toBeNull();
    expect(row.customFields).toEqual({});
  });

  it("custom_fields persistés (attributs métier libres)", async () => {
    const row = await svc.create({
      tenantId,
      name: "Pont de levage",
      customFields: { vehicule_requis: true, pont: 2 },
    });
    expect(row.customFields).toEqual({ vehicule_requis: true, pont: 2 });
  });

  it("findByName : match exact insensible à la casse, puis partiel", async () => {
    await svc.create({ tenantId, name: "Coupe homme", durationMinutes: 30 });
    await svc.create({ tenantId, name: "Coloration", durationMinutes: 90 });

    expect((await svc.findByName(tenantId, "coupe homme"))?.name).toBe("Coupe homme");
    expect((await svc.findByName(tenantId, "coupe"))?.name).toBe("Coupe homme");
    expect((await svc.findByName(tenantId, "une coloration"))?.name).toBe("Coloration");
    expect(await svc.findByName(tenantId, "massage")).toBeNull();
    expect(await svc.findByName(tenantId, "  ")).toBeNull();
  });

  it("findByName : match partiel ambigu → le nom le plus spécifique (court) gagne", async () => {
    await svc.create({ tenantId, name: "Coupe + Barbe", durationMinutes: 45, displayOrder: 0 });
    await svc.create({ tenantId, name: "Coupe", durationMinutes: 30, displayOrder: 1 });

    expect((await svc.findByName(tenantId, "coupe"))?.name).toBe("Coupe");
    expect((await svc.findByName(tenantId, "coupe + barbe"))?.name).toBe("Coupe + Barbe");
  });

  it("update + remove", async () => {
    const row = await svc.create({ tenantId, name: "Massage", durationMinutes: 60 });
    const updated = await svc.update(row.id, { priceCents: 5500, durationMinutes: 75 });
    expect(updated.priceCents).toBe(5500);
    expect(updated.durationMinutes).toBe(75);

    await svc.remove(row.id);
    expect(await svc.listByTenant(tenantId, true)).toHaveLength(0);
  });

  it("doublon de nom pour un même tenant → rejet", async () => {
    await svc.create({ tenantId, name: "Coupe" });
    await expect(svc.create({ tenantId, name: "Coupe" })).rejects.toThrow();
  });
});
