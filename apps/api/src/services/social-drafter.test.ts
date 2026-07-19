import type { LLMClient, LLMResponse } from "@okito/shared/llm";
import { describe, expect, it, vi } from "vitest";
import { SocialDrafterService } from "./social-drafter.js";

function fakeLLM(text: string | null): LLMClient & { complete: ReturnType<typeof vi.fn> } {
  const response: LLMResponse = {
    text,
    toolCalls: [],
    finishReason: "stop",
    usage: { promptTokens: 100, completionTokens: 50 },
  };
  return { complete: vi.fn().mockResolvedValue(response) };
}

const OK = {
  caption: "Ce soir, on remet le couvert pour la soirée du chef ! 🍷",
  hashtags: [
    "#restaurant",
    "#paris",
    "#gastronomie",
    "#faitmaison",
    "#cheflocal",
    "#soireebistro",
    "#produitfrais",
    "#chefdujour",
  ],
  callToAction: "Poste jeudi 18h30 : c'est le créneau où tes stories font le plus de vues.",
  warnings: [],
};

describe("SocialDrafterService", () => {
  it("produit un draft structuré avec ton par défaut et note en contexte", async () => {
    const llm = fakeLLM(JSON.stringify(OK));
    const service = new SocialDrafterService(llm);

    const draft = await service.draft({ note: "Nouveau plat au menu ce soir : joue de bœuf." });

    expect(draft?.caption).toContain("soir");
    expect(draft?.hashtags).toHaveLength(8);
    expect(draft?.hashtags?.[0]).toMatch(/^#/);
    const ctxMsg = llm.complete.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
    expect(ctxMsg).toContain("Ton demandé : chaleureux");
    expect(ctxMsg).toContain("joue de bœuf");
  });

  it("injecte le nom du commerce et le ton personnalisé", async () => {
    const llm = fakeLLM(JSON.stringify(OK));
    const service = new SocialDrafterService(llm);

    await service.draft({
      note: "Ouverture terrasse.",
      tone: "malicieux",
      tenantName: "Bistrot Léo",
    });

    const ctxMsg = llm.complete.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
    expect(ctxMsg).toContain("Commerce : Bistrot Léo");
    expect(ctxMsg).toContain("Ton demandé : malicieux");
  });

  it("tolère un JSON emballé dans des balises markdown", async () => {
    const service = new SocialDrafterService(fakeLLM(`\`\`\`json\n${JSON.stringify(OK)}\n\`\`\``));
    const draft = await service.draft({ note: "Test." });
    expect(draft?.caption).toContain("soir");
  });

  it("rejette un hashtag mal formé (sans dièse)", async () => {
    const bad = { ...OK, hashtags: ["restaurant", ...OK.hashtags.slice(1)] };
    const service = new SocialDrafterService(fakeLLM(JSON.stringify(bad)));
    expect(await service.draft({ note: "x" })).toBeNull();
  });

  it("rejette un JSON invalide ou vide", async () => {
    expect(await new SocialDrafterService(fakeLLM(null)).draft({ note: "x" })).toBeNull();
    expect(await new SocialDrafterService(fakeLLM("pas du json")).draft({ note: "x" })).toBeNull();
  });
});
