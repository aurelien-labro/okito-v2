import { schema } from "@okito/db";
import type { LLMClient, LLMResponse } from "@okito/shared/llm";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { EventBusService } from "./event-bus.js";
import { JarvisAdvisorService } from "./jarvis-advisor.js";

function fakeLLM(text: string | null): LLMClient & { complete: ReturnType<typeof vi.fn> } {
  const response: LLMResponse = {
    text,
    toolCalls: [],
    finishReason: "stop",
    usage: { promptTokens: 100, completionTokens: 50 },
  };
  return { complete: vi.fn().mockResolvedValue(response) };
}

describe("JarvisAdvisorService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-advisor", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  it("génère un brief à partir des événements des dernières 24 h", async () => {
    await ctx.db.insert(schema.events).values([
      { tenantId, type: "reservation.created", payload: { id: "r1" } },
      { tenantId, type: "reservation.created", payload: { id: "r2" } },
      { tenantId, type: "reservation.cancelled", payload: { id: "r1" } },
    ]);
    const llm = fakeLLM("Bonjour ! 2 résas créées, 1 annulée hier.");
    const advisor = new JarvisAdvisorService(ctx.db, llm);

    const brief = await advisor.generateBrief(tenantId);

    expect(brief).toMatchObject({ tenantId, eventCount: 3 });
    const context = llm.complete.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
    expect(context).toContain("reservation.created : 2");
    expect(context).toContain("reservation.cancelled : 1");
  });

  it("mentionne les actions en attente de validation dans le contexte", async () => {
    await ctx.db.insert(schema.jarvisActions).values({
      tenantId,
      type: "tva.declare",
      summary: "TVA juin",
      policy: "approval",
      status: "awaiting_approval",
    });
    const llm = fakeLLM("Brief.");
    const advisor = new JarvisAdvisorService(ctx.db, llm);

    await advisor.generateBrief(tenantId);

    const context = llm.complete.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
    expect(context).toContain("Actions en attente de validation du patron : 1");
  });

  it("publie le brief sur le bus (jarvis.brief.generated)", async () => {
    const llm = fakeLLM("Ton brief du matin.");
    const advisor = new JarvisAdvisorService(ctx.db, llm, new EventBusService(ctx.db));

    await advisor.generateBrief(tenantId);

    const start = Date.now();
    let rows: { type: string }[] = [];
    while (Date.now() - start < 1000) {
      rows = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.type, "jarvis.brief.generated"));
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(rows).toHaveLength(1);
  });

  it("LLM muet : retourne null sans publier", async () => {
    const advisor = new JarvisAdvisorService(ctx.db, fakeLLM(null));
    expect(await advisor.generateBrief(tenantId)).toBeNull();
  });

  it("runForAllTenants : un tenant en échec ne bloque pas les autres", async () => {
    const [other] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-2", name: "Resto 2" })
      .returning();
    if (!other) throw new Error("tenant insert failed");

    const llm = fakeLLM("Brief.");
    llm.complete.mockRejectedValueOnce(new Error("quota LLM")).mockResolvedValue({
      text: "Brief.",
      toolCalls: [],
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1 },
    });
    const advisor = new JarvisAdvisorService(ctx.db, llm);

    const result = await advisor.runForAllTenants();

    expect(result).toMatchObject({ tenantsProcessed: 2, briefsGenerated: 1 });
  });
});
