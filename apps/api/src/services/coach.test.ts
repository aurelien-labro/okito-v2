import { schema } from "@okito/db";
import type { LLMClient, LLMResponse } from "@okito/shared/llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { CoachService } from "./coach.js";

function fakeLLM(text: string | null): LLMClient & { complete: ReturnType<typeof vi.fn> } {
  const response: LLMResponse = {
    text,
    toolCalls: [],
    finishReason: "stop",
    usage: { promptTokens: 100, completionTokens: 50 },
  };
  return { complete: vi.fn().mockResolvedValue(response) };
}

const OK_PAYLOAD = JSON.stringify({
  priorities: [
    { text: "Rappeler la table 12", why: "1 no-show hier soir" },
    { text: "Valider la relance facture 184", why: "1 facture en retard depuis 6 j" },
    {
      text: "Cette semaine : préparer le service du samedi soir",
      why: "Journal vide sur ce point",
    },
  ],
});

describe("CoachService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-coach", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  it("produit 3 priorités structurées à partir du journal + actions en attente", async () => {
    await ctx.db.insert(schema.events).values([
      { tenantId, type: "reservation.created", payload: { id: "r1" } },
      { tenantId, type: "review.submitted", payload: { rating: 2 } },
    ]);
    await ctx.db.insert(schema.jarvisActions).values([
      {
        tenantId,
        type: "review.reply",
        summary: "Répondre à un avis 2★",
        status: "awaiting_approval",
        policy: "approval",
        payload: {},
      },
    ]);
    const llm = fakeLLM(OK_PAYLOAD);
    const coach = new CoachService(ctx.db, llm);

    const plan = await coach.plan(tenantId);

    expect(plan).not.toBeNull();
    expect(plan?.priorities).toHaveLength(3);
    expect(plan?.priorities[0]?.text).toContain("table 12");
    expect(plan?.pendingApprovals).toBe(1);
    expect(plan?.eventCount).toBe(2);

    const ctxMsg = llm.complete.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
    expect(ctxMsg).toContain("review.submitted : 1");
    expect(ctxMsg).toContain("Actions Jarvis en attente de validation : 1");
  });

  it("tolère un JSON emballé dans des balises markdown", async () => {
    const llm = fakeLLM(`\`\`\`json\n${OK_PAYLOAD}\n\`\`\``);
    const coach = new CoachService(ctx.db, llm);
    const plan = await coach.plan(tenantId);
    expect(plan?.priorities).toHaveLength(3);
  });

  it("retourne null quand le LLM est muet ou renvoie un JSON invalide", async () => {
    const mute = new CoachService(ctx.db, fakeLLM(null));
    expect(await mute.plan(tenantId)).toBeNull();

    const bad = new CoachService(ctx.db, fakeLLM("pas du json"));
    expect(await bad.plan(tenantId)).toBeNull();

    const wrongLen = new CoachService(
      ctx.db,
      fakeLLM(JSON.stringify({ priorities: [{ text: "a", why: "b" }] })),
    );
    expect(await wrongLen.plan(tenantId)).toBeNull();
  });

  describe("nudge (rule-based, jamais LLM)", () => {
    it("est urgent quand ≥ 3 actions attendent la validation", async () => {
      await ctx.db.insert(schema.jarvisActions).values(
        Array.from({ length: 3 }, () => ({
          tenantId,
          type: "review.reply",
          summary: "Répondre à un avis",
          status: "awaiting_approval" as const,
          policy: "approval" as const,
          payload: {},
        })),
      );
      const coach = new CoachService(ctx.db, fakeLLM(OK_PAYLOAD));
      const plan = await coach.plan(tenantId);
      expect(plan?.nudge).toMatchObject({ urgent: true });
      expect(plan?.nudge?.label).toContain("3 actions");
    });

    it("est null quand rien n'attend d'action", async () => {
      const coach = new CoachService(ctx.db, fakeLLM(OK_PAYLOAD));
      const plan = await coach.plan(tenantId);
      expect(plan?.nudge).toBeNull();
    });

    it("signale les factures en retard avec un pluriel correct", async () => {
      const [invoice] = await ctx.db
        .insert(schema.invoices)
        .values({
          tenantId,
          number: "2026-0001",
          customerName: "Client A",
          customerEmail: "a@example.com",
          amountCents: 10000,
          status: "sent",
          dueDate: new Date(Date.now() - 24 * 3600_000),
        })
        .returning();
      expect(invoice).toBeDefined();

      const coach = new CoachService(ctx.db, fakeLLM(OK_PAYLOAD));
      const plan = await coach.plan(tenantId);
      expect(plan?.nudge?.label).toBe("1 facture en retard à relancer");
    });
  });
});
