import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { CampaignService } from "./campaign.js";
import type { Notifier } from "./notifier.js";

const NOW = new Date("2026-07-16T12:00:00Z");

function fakeNotifier(failFor: string[] = []): Notifier {
  return {
    send: vi.fn(async (input: { to: string }) => ({
      delivered: !failFor.includes(input.to),
      provider: "fake",
      ...(failFor.includes(input.to) ? { error: "boom" } : {}),
    })),
    notifyReservationCreated: vi.fn(),
    notifyReservationCancelled: vi.fn(),
  } as unknown as Notifier;
}

describe("CampaignService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-mkt", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function seedReservation(
    phone: string,
    name: string,
    date: string,
    opts: { email?: string | null; status?: string; count?: number } = {},
  ) {
    const count = opts.count ?? 1;
    for (let i = 0; i < count; i++) {
      await ctx.db.insert(schema.reservations).values({
        tenantId,
        customerName: name,
        customerPhone: phone,
        customerEmail: opts.email ?? null,
        couverts: 2,
        dateReservation: date,
        heure: `${(18 + i) % 24}:00`.padStart(5, "0"),
        status: (opts.status ?? "completed") as "completed",
      });
    }
  }

  it("resolveSegment : all / regulars / recent / dormant", async () => {
    // Habitué récent : 3 visites, dernière il y a 5 jours.
    await seedReservation("+331", "Alice Dupont", "2026-07-11", { count: 3, email: "a@x.fr" });
    // Client dormant : 1 visite il y a 90 jours.
    await seedReservation("+332", "Bob Martin", "2026-04-17");
    // Résa annulée : ne compte pas.
    await seedReservation("+333", "Zoé", "2026-07-10", { status: "cancelled" });

    const svc = new CampaignService(ctx.db, fakeNotifier());
    const all = await svc.resolveSegment(tenantId, "all", NOW);
    expect(all.map((r) => r.customerPhone).sort()).toEqual(["+331", "+332"]);

    expect(
      (await svc.resolveSegment(tenantId, "regulars", NOW)).map((r) => r.customerPhone),
    ).toEqual(["+331"]);
    expect((await svc.resolveSegment(tenantId, "recent", NOW)).map((r) => r.customerPhone)).toEqual(
      ["+331"],
    );
    expect(
      (await svc.resolveSegment(tenantId, "dormant", NOW)).map((r) => r.customerPhone),
    ).toEqual(["+332"]);

    const counts = await svc.segmentCounts(tenantId, NOW);
    expect(counts).toEqual({ all: 2, regulars: 1, recent: 1, dormant: 1 });
  });

  it("create : sujet requis pour l'email", async () => {
    const svc = new CampaignService(ctx.db, fakeNotifier());
    await expect(
      svc.create(tenantId, { name: "X", channel: "email", segment: "all", body: "Hello" }),
    ).rejects.toThrow(/sujet/i);
    const draft = await svc.create(tenantId, {
      name: "X",
      channel: "whatsapp",
      segment: "all",
      body: "Hello",
    });
    expect(draft.status).toBe("draft");
  });

  it("send : personnalise {prenom}, filtre les emails manquants, fige les compteurs", async () => {
    await seedReservation("+331", "Alice Dupont", "2026-07-11", { email: "alice@x.fr" });
    await seedReservation("+332", "Bob Martin", "2026-07-12"); // pas d'email → exclu du canal email

    const notifier = fakeNotifier();
    const svc = new CampaignService(ctx.db, notifier);
    const draft = await svc.create(tenantId, {
      name: "Promo",
      channel: "email",
      segment: "all",
      subject: "Coucou",
      body: "Bonjour {prenom} !",
    });

    const result = await svc.send(tenantId, draft.id, NOW);

    expect(result).toMatchObject({ recipientCount: 1, sentCount: 1, failedCount: 0 });
    const sendMock = notifier.send as ReturnType<typeof vi.fn>;
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
      channel: "email",
      to: "alice@x.fr",
      subject: "Coucou",
      body: "Bonjour Alice !",
    });

    const [row] = await ctx.db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, draft.id));
    expect(row?.status).toBe("sent");
    expect(row?.sentCount).toBe(1);

    // Ré-envoi interdit.
    await expect(svc.send(tenantId, draft.id, NOW)).rejects.toThrow(/déjà envoyée/i);
  });

  it("send whatsapp : un échec n'arrête pas les autres et incrémente failedCount", async () => {
    await seedReservation("+331", "Alice", "2026-07-11");
    await seedReservation("+332", "Bob", "2026-07-12");

    const svc = new CampaignService(ctx.db, fakeNotifier(["+331"]));
    const draft = await svc.create(tenantId, {
      name: "Flash",
      channel: "whatsapp",
      segment: "all",
      body: "Ce soir -20%",
    });

    const result = await svc.send(tenantId, draft.id, NOW);
    expect(result.recipientCount).toBe(2);
    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it("removeDraft : supprime un brouillon mais jamais une campagne envoyée", async () => {
    await seedReservation("+331", "Alice", "2026-07-11");
    const svc = new CampaignService(ctx.db, fakeNotifier());
    const draft = await svc.create(tenantId, {
      name: "A",
      channel: "whatsapp",
      segment: "all",
      body: "x",
    });
    await svc.removeDraft(tenantId, draft.id);
    expect(await svc.list(tenantId)).toHaveLength(0);

    const sent = await svc.create(tenantId, {
      name: "B",
      channel: "whatsapp",
      segment: "all",
      body: "y",
    });
    await svc.send(tenantId, sent.id, NOW);
    await expect(svc.removeDraft(tenantId, sent.id)).rejects.toThrow(/introuvable/i);
  });
});
