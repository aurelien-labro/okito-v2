import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { AuditLogService } from "./audit-log.js";
import { NoShowService } from "./no-show.js";

function isoOffset(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

describe("NoShowService.markStale", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-noshow", name: "Resto", timezone: "Europe/Paris" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  let phoneSeq = 0;
  async function insert(status: string, dateReservation: string, heure: string) {
    phoneSeq++;
    const [row] = await ctx.db
      .insert(schema.reservations)
      .values({
        tenantId,
        customerName: "Test",
        customerPhone: `06000000${String(phoneSeq).padStart(2, "0")}`,
        couverts: 2,
        dateReservation,
        heure,
        status: status as "confirmed",
      })
      .returning();
    if (!row) throw new Error("insert failed");
    return row;
  }

  it("marque no_show une résa confirmée passée, laisse les autres statuts", async () => {
    const stale = await insert("confirmed", isoOffset(-2), "20:00");
    const cancelled = await insert("cancelled", isoOffset(-2), "20:00");
    const svc = new NoShowService(ctx.db);

    const result = await svc.markStale();
    expect(result.marked).toBe(1);

    const rows = await ctx.db.select().from(schema.reservations);
    expect(rows.find((r) => r.id === stale.id)?.status).toBe("no_show");
    expect(rows.find((r) => r.id === cancelled.id)?.status).toBe("cancelled");
  });

  it("laisse une résa future intacte", async () => {
    const future = await insert("confirmed", isoOffset(2), "20:00");
    const svc = new NoShowService(ctx.db);
    const result = await svc.markStale();
    expect(result.marked).toBe(0);
    const rows = await ctx.db.select().from(schema.reservations);
    expect(rows.find((r) => r.id === future.id)?.status).toBe("confirmed");
  });

  it("dryRun ne modifie rien", async () => {
    await insert("confirmed", isoOffset(-2), "20:00");
    const svc = new NoShowService(ctx.db);
    const result = await svc.markStale({ dryRun: true });
    expect(result.marked).toBe(1);
    const rows = await ctx.db.select().from(schema.reservations);
    expect(rows[0]?.status).toBe("confirmed");
  });

  it("écrit un audit log sur chaque bascule", async () => {
    await insert("confirmed", isoOffset(-2), "20:00");
    const audit = new AuditLogService(ctx.db);
    const svc = new NoShowService(ctx.db, audit);
    await svc.markStale();
    const logs = await audit.list({ tenantId, entityType: "reservation" });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe("reservation.no_show_auto");
  });
});
