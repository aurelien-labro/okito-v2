import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { CustomerTimelineService } from "./customer-timeline.js";

describe("CustomerTimelineService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let svc: CustomerTimelineService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-360", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    svc = new CustomerTimelineService(ctx.db);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function addReservation(opts: {
    date: string;
    status?: "confirmed" | "cancelled" | "no_show" | "completed";
    email?: string | null;
  }) {
    const [row] = await ctx.db
      .insert(schema.reservations)
      .values({
        tenantId,
        customerName: "Marie Petit",
        customerPhone: "0611111111",
        customerEmail: opts.email ?? null,
        couverts: 2,
        dateReservation: opts.date,
        heure: "20:00",
        status: opts.status ?? "confirmed",
      })
      .returning();
    if (!row) throw new Error("resa insert failed");
    return row;
  }

  it("null si le client n'a aucune réservation", async () => {
    expect(await svc.getByPhone(tenantId, "0600000000")).toBeNull();
  });

  it("agrège visites, annulations, no-shows et email", async () => {
    await addReservation({ date: "2026-06-01", status: "completed", email: "marie@test.fr" });
    await addReservation({ date: "2026-06-15", status: "confirmed" });
    await addReservation({ date: "2026-06-20", status: "cancelled" });
    await addReservation({ date: "2026-06-25", status: "no_show" });

    const profile = await svc.getByPhone(tenantId, "0611111111");
    expect(profile).toMatchObject({
      name: "Marie Petit",
      email: "marie@test.fr",
      visitCount: 2,
      cancelledCount: 1,
      noShowCount: 1,
      firstSeen: "2026-06-01",
      lastSeen: "2026-06-25",
    });
    expect(profile?.timeline.length).toBe(4);
  });

  it("intègre avis et emails dans la timeline, triée récent d'abord", async () => {
    const resa = await addReservation({
      date: "2026-06-01",
      status: "completed",
      email: "marie@test.fr",
    });
    await ctx.db.insert(schema.reservationReviews).values({
      tenantId,
      reservationId: resa.id,
      rating: 5,
      comment: "Parfait",
      submittedAt: new Date("2026-06-02T10:00:00Z"),
    });
    await ctx.db.insert(schema.events).values({
      tenantId,
      type: "email.received",
      payload: { from: "Marie <marie@test.fr>", subject: "Merci", snippet: "C'était top" },
      createdAt: new Date("2026-07-01T10:00:00Z"),
    });

    const profile = await svc.getByPhone(tenantId, "0611111111");
    expect(profile?.averageRating).toBe(5);
    const kinds = profile?.timeline.map((t) => t.kind);
    expect(kinds).toContain("review");
    expect(kinds).toContain("email");
    // email (juillet) doit être avant l'avis/résa (juin) — tri récent d'abord
    expect(profile?.timeline[0]?.kind).toBe("email");
  });

  it("n'inclut pas les emails d'un autre expéditeur", async () => {
    await addReservation({ date: "2026-06-01", email: "marie@test.fr" });
    await ctx.db.insert(schema.events).values({
      tenantId,
      type: "email.received",
      payload: { from: "Bob <bob@autre.fr>", subject: "Autre" },
    });
    const profile = await svc.getByPhone(tenantId, "0611111111");
    expect(profile?.timeline.some((t) => t.kind === "email")).toBe(false);
  });
});
