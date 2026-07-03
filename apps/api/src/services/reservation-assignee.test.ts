import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { ReservationService } from "./reservation.js";

describe("ReservationService — assignedMemberId", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let svc: ReservationService;
  let tenantId: string;
  let memberId: string;
  let otherTenantMemberId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    svc = new ReservationService(ctx.db);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "salon-assignee", name: "Salon Assignee" })
      .returning();
    const [otherTenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "garage-intrus", name: "Garage Intrus" })
      .returning();
    if (!tenant || !otherTenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;

    const [member] = await ctx.db
      .insert(schema.tenantMembers)
      .values({ tenantId, invitedEmail: "sophie@salon.fr", role: "staff" })
      .returning();
    const [otherMember] = await ctx.db
      .insert(schema.tenantMembers)
      .values({ tenantId: otherTenant.id, invitedEmail: "max@garage.fr", role: "staff" })
      .returning();
    if (!member || !otherMember) throw new Error("member insert failed");
    memberId = member.id;
    otherTenantMemberId = otherMember.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const core = {
    customerName: "Marc Dupuis",
    customerPhone: "0612345678",
    couverts: 1,
    dateReservation: "2026-07-10",
    heure: "10:00",
  };

  it("create avec assignedMemberId du tenant → persisté", async () => {
    const row = await svc.create({ tenantId, data: core, assignedMemberId: memberId });
    expect(row.assignedMemberId).toBe(memberId);
  });

  it("create sans assignedMemberId → null", async () => {
    const row = await svc.create({ tenantId, data: core });
    expect(row.assignedMemberId).toBeNull();
  });

  it("create avec un membre d'un AUTRE tenant → rejet unknown_member (anti-IDOR)", async () => {
    await expect(
      svc.create({ tenantId, data: core, assignedMemberId: otherTenantMemberId }),
    ).rejects.toMatchObject({ code: "unknown_member" });
  });

  it("update : assigner, refuser cross-tenant, puis désassigner (null)", async () => {
    const row = await svc.create({ tenantId, data: core });

    const assigned = await svc.update({
      tenantId,
      id: row.id,
      patch: { assignedMemberId: memberId },
    });
    expect(assigned.assignedMemberId).toBe(memberId);

    await expect(
      svc.update({ tenantId, id: row.id, patch: { assignedMemberId: otherTenantMemberId } }),
    ).rejects.toMatchObject({ code: "unknown_member" });

    const cleared = await svc.update({
      tenantId,
      id: row.id,
      patch: { assignedMemberId: null },
    });
    expect(cleared.assignedMemberId).toBeNull();
  });
});
