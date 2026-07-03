import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { CustomerPrivacyService } from "./customer-privacy.js";

const PHONE = "0612345678";

describe("CustomerPrivacyService.forget", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let svc: CustomerPrivacyService;
  let tenantId: string;
  let otherTenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    svc = new CustomerPrivacyService(ctx.db);
    const [t] = await ctx.db.insert(schema.tenants).values({ slug: "t1", name: "T1" }).returning();
    const [o] = await ctx.db.insert(schema.tenants).values({ slug: "t2", name: "T2" }).returning();
    if (!t || !o) throw new Error("tenant insert failed");
    tenantId = t.id;
    otherTenantId = o.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("anonymise résas + waitlist du client, supprime ses avis, épargne les autres tenants", async () => {
    const [resa] = await ctx.db
      .insert(schema.reservations)
      .values({
        tenantId,
        customerName: "Marc Dupuis",
        customerPhone: PHONE,
        customerEmail: "marc@x.fr",
        couverts: 2,
        dateReservation: "2026-07-01",
        heure: "20:00",
        notes: "allergie",
      })
      .returning();
    if (!resa) throw new Error("resa insert failed");

    await ctx.db.insert(schema.reservationReviews).values({
      tenantId,
      reservationId: resa.id,
      rating: 5,
      comment: "super",
    });

    await ctx.db.insert(schema.waitlistEntries).values({
      tenantId,
      customerName: "Marc Dupuis",
      customerPhone: PHONE,
      couverts: 2,
      dateSouhaitee: "2026-07-02",
      heureSouhaitee: "20:00",
    });

    // Résa d'un autre client dans un autre tenant, même numéro : ne doit PAS bouger.
    const [otherResa] = await ctx.db
      .insert(schema.reservations)
      .values({
        tenantId: otherTenantId,
        customerName: "Marc Dupuis",
        customerPhone: PHONE,
        couverts: 2,
        dateReservation: "2026-07-01",
        heure: "20:00",
      })
      .returning();
    if (!otherResa) throw new Error("other resa insert failed");

    const result = await svc.forget(tenantId, PHONE);
    expect(result).toEqual({
      reservationsAnonymized: 1,
      waitlistAnonymized: 1,
      reviewsDeleted: 1,
    });

    const all = await ctx.db.select().from(schema.reservations);
    const mine = all.find((r) => r.id === resa.id);
    expect(mine?.customerName).toBe("[client supprimé]");
    expect(mine?.customerPhone).toMatch(/^\[supprimé-[a-f0-9]{12}\]$/);
    expect(mine?.customerEmail).toBeNull();
    expect(mine?.notes).toBeNull();

    const untouched = all.find((r) => r.id === otherResa.id);
    expect(untouched?.customerName).toBe("Marc Dupuis");
    expect(untouched?.customerPhone).toBe(PHONE);

    const reviews = await ctx.db.select().from(schema.reservationReviews);
    expect(reviews).toHaveLength(0);
  });

  it("deux clients différents effacés au même créneau ne heurtent pas l'index unique", async () => {
    await ctx.db.insert(schema.reservations).values({
      tenantId,
      customerName: "Client A",
      customerPhone: "0600000001",
      couverts: 2,
      dateReservation: "2026-08-01",
      heure: "19:00",
    });
    await ctx.db.insert(schema.reservations).values({
      tenantId,
      customerName: "Client B",
      customerPhone: "0600000002",
      couverts: 2,
      dateReservation: "2026-08-01",
      heure: "19:00",
    });

    await expect(svc.forget(tenantId, "0600000001")).resolves.toMatchObject({
      reservationsAnonymized: 1,
    });
    await expect(svc.forget(tenantId, "0600000002")).resolves.toMatchObject({
      reservationsAnonymized: 1,
    });

    const all = await ctx.db.select().from(schema.reservations);
    const phones = all.map((r) => r.customerPhone);
    // Les deux téléphones anonymisés sont distincts (suffixe unique).
    expect(new Set(phones).size).toBe(phones.length);
  });
});
