import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/lib/errors.js";
import { ReservationService } from "../../src/services/reservation.js";
import { TenantService } from "../../src/services/tenant.js";
import { createTestDb } from "../_helpers/pg.js";

describe("multi-tenant isolation (pglite)", () => {
  let dbHandle: Awaited<ReturnType<typeof createTestDb>>;
  let tenantSvc: TenantService;
  let reservationSvc: ReservationService;

  beforeEach(async () => {
    dbHandle = await createTestDb();
    tenantSvc = new TenantService(dbHandle.db);
    reservationSvc = new ReservationService(dbHandle.db);
  });

  afterEach(async () => {
    await dbHandle.cleanup();
  });

  async function seedTenants() {
    const okito = await tenantSvc.create({
      slug: "okito",
      name: "OKITO",
    });
    const bistrot = await tenantSvc.create({
      slug: "bistrot-paul",
      name: "Bistrot de Paul",
    });
    return { okito, bistrot };
  }

  it("ReservationService.list filtre strictement par tenant_id", async () => {
    const { okito, bistrot } = await seedTenants();

    await reservationSvc.create({
      tenantId: okito.id,
      data: {
        customerName: "Alice Okito",
        customerPhone: "+33611111111",
        couverts: 2,
        dateReservation: "2026-06-28",
        heure: "20:00",
      },
    });
    await reservationSvc.create({
      tenantId: bistrot.id,
      data: {
        customerName: "Bob Bistrot",
        customerPhone: "+33622222222",
        couverts: 4,
        dateReservation: "2026-06-28",
        heure: "20:00",
      },
    });

    const okitoList = await reservationSvc.list({ tenantId: okito.id });
    const bistrotList = await reservationSvc.list({ tenantId: bistrot.id });

    expect(okitoList).toHaveLength(1);
    expect(okitoList[0]?.customerName).toBe("Alice Okito");

    expect(bistrotList).toHaveLength(1);
    expect(bistrotList[0]?.customerName).toBe("Bob Bistrot");
  });

  it("ReservationService.getById refuse l'accès cross-tenant", async () => {
    const { okito, bistrot } = await seedTenants();
    const okitoRes = await reservationSvc.create({
      tenantId: okito.id,
      data: {
        customerName: "Alice",
        customerPhone: "+33611111111",
        couverts: 2,
        dateReservation: "2026-06-28",
        heure: "20:00",
      },
    });

    // Bistrot tente de récupérer la résa d'OKITO avec son propre tenantId
    await expect(
      reservationSvc.getById({ tenantId: bistrot.id, id: okitoRes.id }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Le vrai owner peut bien la récupérer
    const own = await reservationSvc.getById({ tenantId: okito.id, id: okitoRes.id });
    expect(own.id).toBe(okitoRes.id);
  });

  it("ReservationService.update refuse de modifier une résa d'un autre tenant", async () => {
    const { okito, bistrot } = await seedTenants();
    const okitoRes = await reservationSvc.create({
      tenantId: okito.id,
      data: {
        customerName: "Alice",
        customerPhone: "+33611111111",
        couverts: 2,
        dateReservation: "2026-06-28",
        heure: "20:00",
      },
    });

    await expect(
      reservationSvc.update({
        tenantId: bistrot.id,
        id: okitoRes.id,
        patch: { couverts: 6 },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // La résa n'a pas été modifiée
    const reread = await reservationSvc.getById({ tenantId: okito.id, id: okitoRes.id });
    expect(reread.couverts).toBe(2);
  });
});
