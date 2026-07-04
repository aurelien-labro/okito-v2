import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import type { JarvisAdvisorService, JarvisBrief } from "../services/jarvis-advisor.js";
import { adminJarvisBriefRoute } from "./admin-jarvis-brief.js";

describe("adminJarvisBriefRoute", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-brief", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET renvoie le dernier brief publié", async () => {
    await ctx.db.insert(schema.events).values([
      {
        tenantId,
        type: "jarvis.brief.generated",
        source: "jarvis",
        payload: { text: "Ancien brief" },
        createdAt: new Date(Date.now() - 3600_000),
      },
      {
        tenantId,
        type: "jarvis.brief.generated",
        source: "jarvis",
        payload: { text: "Brief du jour", eventCount: 12 },
      },
    ]);
    const app = adminJarvisBriefRoute(ctx.db);

    const res = await app.request(`/${tenantId}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { text: string; eventCount: number } };
    expect(body.data).toMatchObject({ text: "Brief du jour", eventCount: 12 });
  });

  it("GET 404 si aucun brief", async () => {
    const app = adminJarvisBriefRoute(ctx.db);
    const res = await app.request(`/${tenantId}`);
    expect(res.status).toBe(404);
  });

  it("POST régénère via l'advisor", async () => {
    const fakeAdvisor = {
      generateBrief: async (id: string): Promise<JarvisBrief> => ({
        tenantId: id,
        text: "Brief frais",
        eventCount: 3,
        generatedAt: new Date(),
      }),
    } as unknown as JarvisAdvisorService;
    const app = adminJarvisBriefRoute(ctx.db, fakeAdvisor);

    const res = await app.request(`/${tenantId}`, { method: "POST" });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { text: string } };
    expect(body.data.text).toBe("Brief frais");
  });

  it("POST 400 si advisor absent (LLM non configuré)", async () => {
    const app = adminJarvisBriefRoute(ctx.db);
    const res = await app.request(`/${tenantId}`, { method: "POST" });
    expect(res.status).toBe(400);
  });
});
