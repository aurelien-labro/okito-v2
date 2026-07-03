import { schema } from "@okito/db";
import type { Tenant } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { CapacityService } from "../services/capacity.js";
import { ReservationService } from "../services/reservation.js";
import { ScheduleRuleService } from "../services/schedule-rule.js";
import { TenantService } from "../services/tenant.js";
import { portalRoute } from "./portal.js";

describe("portail client /r/:token", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof portalRoute>;
  let reservation: ReservationService;
  let tenant: Tenant;
  let token: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    await ctx.db.execute(
      `
      create or replace function get_creneau_capacity(t uuid, d date, h time)
      returns integer language sql as $$
        select coalesce(sum(couverts), 0)::integer from reservations
        where tenant_id = t and date_reservation = d and heure = h and status = 'confirmed'
      $$;
    ` as never,
    );

    const [row] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "spa-portal", name: "Spa Lumière", capacityMax: 10 })
      .returning();
    if (!row) throw new Error("tenant insert failed");
    tenant = row;

    reservation = new ReservationService(ctx.db);
    app = portalRoute({
      reservation,
      tenant: new TenantService(ctx.db),
      capacity: new CapacityService(ctx.db),
      scheduleRules: new ScheduleRuleService(ctx.db),
    });

    const created = await reservation.create({
      tenantId: tenant.id,
      data: {
        customerName: "Emma Blanc",
        customerPhone: "0611223344",
        couverts: 2,
        dateReservation: "2026-07-10",
        heure: "13:00",
      },
    });
    token = created.accessToken;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET /r/:token → vue publique minimale (pas de téléphone complet)", async () => {
    const res = await app.request(`/${token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data.tenantName).toBe("Spa Lumière");
    expect(body.data.customerFirstName).toBe("Emma");
    expect(body.data.phoneMasked).toBe("••••••3344");
    expect(body.data.heure).toBe("13:00");
    expect(JSON.stringify(body.data)).not.toContain("0611223344");
  });

  it("token inconnu ou malformé → 404 sans fuite", async () => {
    const res = await app.request(`/${"a".repeat(64)}`);
    expect(res.status).toBe(404);
    const malformed = await app.request("/pas-un-token");
    expect(malformed.status).toBe(404);
  });

  it("POST cancel → annule, puis idempotent", async () => {
    const res = await app.request(`/${token}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe("cancelled");

    const again = await app.request(`/${token}/cancel`, { method: "POST" });
    expect(again.status).toBe(200);
  });

  it("PATCH → modifie l'heure dans la fenêtre de service", async () => {
    const res = await app.request(`/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heure: "13:30", couverts: 3 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { heure: string; couverts: number } };
    expect(body.data.heure).toBe("13:30");
    expect(body.data.couverts).toBe(3);
  });

  it("PATCH hors horaires → 409 out_of_service", async () => {
    const res = await app.request(`/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heure: "03:00" }),
    });
    expect(res.status).toBe(409);
  });

  it("PATCH sur jour fermé (schedule rule) → 409", async () => {
    const rules = new ScheduleRuleService(ctx.db);
    // 2026-07-13 est un lundi.
    await rules.create({ tenantId: tenant.id, kind: "weekly_closed", payload: { weekdays: [1] } });
    const res = await app.request(`/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateReservation: "2026-07-13" }),
    });
    expect(res.status).toBe(409);
  });

  it("PATCH après annulation → 409 not_editable", async () => {
    await app.request(`/${token}/cancel`, { method: "POST" });
    const res = await app.request(`/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couverts: 4 }),
    });
    expect(res.status).toBe(409);
  });
});
