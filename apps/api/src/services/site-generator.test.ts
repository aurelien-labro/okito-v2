import { schema } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import type { OnboardingScanService } from "./onboarding-scan.js";
import { SiteGeneratorService } from "./site-generator.js";
import { SiteService } from "./site.js";

const GENERATED = {
  hero: {
    title: "Le Bistrot",
    subtitle: "Cuisine de saison au cœur de Paris",
    ctaLabel: "Réserver",
  },
  info: { address: "12 rue de la Paix, 75002 Paris", hours: null },
  seo: {
    title: "Le Bistrot — restaurant Paris 2e",
    description: "Cuisine de saison, réservez en ligne.",
  },
};

function fakeLlm(text: string | null): LLMClient {
  return { complete: vi.fn(async () => ({ text })) } as unknown as LLMClient;
}

function fakeScan(): OnboardingScanService {
  return {
    scanWebsite: vi.fn(async () => ({ url: "https://x.fr", reachable: true })),
    scanGoogleBusiness: vi.fn(async () => ({ found: true, name: "Le Bistrot" })),
  } as unknown as OnboardingScanService;
}

describe("SiteGeneratorService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let site: SiteService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "le-bistrot", name: "Le Bistrot" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    site = new SiteService(ctx.db);
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  it("génère et enregistre un brouillon (hero + info + seo, null omis)", async () => {
    const svc = new SiteGeneratorService(fakeScan(), site, fakeLlm(JSON.stringify(GENERATED)));
    const result = await svc.generate(tenantId, { websiteUrl: "x.fr", businessQuery: "bistrot" });

    expect(result.status).toBe("draft");
    expect(result.blocks.hero).toEqual(GENERATED.hero);
    // hours=null → clé absente, pas de null en base.
    expect(result.blocks.info).toEqual({ address: GENERATED.info.address });
    expect(result.seo).toEqual(GENERATED.seo);
  });

  it("tolère les fences markdown de Gemini", async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(GENERATED)}\n\`\`\``;
    const svc = new SiteGeneratorService(fakeScan(), site, fakeLlm(fenced));
    const result = await svc.generate(tenantId, { websiteUrl: "x.fr" });
    expect((result.blocks.hero as { title: string }).title).toBe("Le Bistrot");
  });

  it("refuse d'écraser un site déjà rempli sans force", async () => {
    await site.upsert(tenantId, { blocks: { hero: { title: "Existant" } } });
    const svc = new SiteGeneratorService(fakeScan(), site, fakeLlm(JSON.stringify(GENERATED)));

    await expect(svc.generate(tenantId, { websiteUrl: "x.fr" })).rejects.toThrow(
      /déjà du contenu/i,
    );

    const forced = await svc.generate(tenantId, { websiteUrl: "x.fr", force: true });
    expect((forced.blocks.hero as { title: string }).title).toBe("Le Bistrot");
  });

  it("échecs explicites : aucune source, LLM muet, JSON invalide", async () => {
    const svc = new SiteGeneratorService(fakeScan(), site, fakeLlm(null));
    await expect(svc.generate(tenantId, {})).rejects.toThrow(/au moins/i);
    await expect(svc.generate(tenantId, { websiteUrl: "x.fr" })).rejects.toThrow(/pas produit/i);

    const svcBad = new SiteGeneratorService(fakeScan(), site, fakeLlm("pas du json"));
    await expect(svcBad.generate(tenantId, { websiteUrl: "x.fr" })).rejects.toThrow(/JSON valide/i);
  });
});
