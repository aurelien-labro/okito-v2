import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { type EventPublisher, trackRoute } from "./track.js";

function fakeBus(): EventPublisher & { publish: ReturnType<typeof vi.fn> } {
  return { publish: vi.fn() };
}

describe("trackRoute", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-track", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("POST publie un event site.visit sur le bus", async () => {
    const bus = fakeBus();
    const app = trackRoute(ctx.db, bus);

    const res = await app.request(`/${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1", path: "/menu", referrer: "https://google.com" }),
    });

    expect(res.status).toBe(204);
    expect(bus.publish).toHaveBeenCalledWith(
      tenantId,
      "site.visit",
      { path: "/menu", referrer: "https://google.com", sessionId: "s1" },
      "site",
    );
  });

  it("POST 400 sans sessionId", async () => {
    const app = trackRoute(ctx.db, fakeBus());
    const res = await app.request(`/${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST 404 pour un tenant inconnu — le journal n'est pas pollué", async () => {
    const bus = fakeBus();
    const app = trackRoute(ctx.db, bus);
    const res = await app.request("/00000000-0000-4000-8000-000000000000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(404);
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("GET script.js sert le tracker avec la bonne URL", async () => {
    const app = trackRoute(ctx.db, fakeBus(), "https://api.okito.app");

    const res = await app.request(`/${tenantId}/script.js`);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    const js = await res.text();
    expect(js).toContain(`https://api.okito.app/v1/track/${tenantId}`);
    expect(js).toContain("sendBeacon");
  });

  it("POST rate-limite une session trop bavarde", async () => {
    const bus = fakeBus();
    const app = trackRoute(ctx.db, bus);
    const hit = () =>
      app.request(`/${tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "spammer" }),
      });

    let last = 0;
    for (let i = 0; i < 61; i++) {
      last = (await hit()).status;
    }
    expect(last).toBe(429);
  });
});
