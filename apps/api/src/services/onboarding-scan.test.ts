import { schema } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { BadRequestError } from "../lib/errors.js";
import { EventBusService } from "./event-bus.js";
import { OnboardingScanService } from "./onboarding-scan.js";

function fakeLLM(text: string | null): LLMClient & { complete: ReturnType<typeof vi.fn> } {
  return {
    complete: vi.fn().mockResolvedValue({
      text,
      toolCalls: [],
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  };
}

const HTML = `<html><head>
<title>Chez Marcel — Boulangerie</title>
<meta name="description" content="Pains artisanaux à Lyon 3e">
<meta name="viewport" content="width=device-width">
</head><body><h1>Bienvenue</h1></body></html>`;

describe("OnboardingScanService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-onboard", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  it("scanWebsite : extrait perf, title, meta description et viewport", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(HTML, { status: 200 }));
    const svc = new OnboardingScanService(
      ctx.db,
      fakeLLM("x"),
      undefined,
      undefined,
      fetchMock as unknown as typeof fetch,
    );

    const scan = await svc.scanWebsite("chezmarcel.fr");

    expect(scan).toMatchObject({
      url: "https://chezmarcel.fr",
      reachable: true,
      httpStatus: 200,
      https: true,
      title: "Chez Marcel — Boulangerie",
      metaDescription: "Pains artisanaux à Lyon 3e",
      hasViewportMeta: true,
    });
    expect(scan.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("scanWebsite : URL interne refusée (anti-SSRF)", async () => {
    const svc = new OnboardingScanService(ctx.db, fakeLLM("x"));
    await expect(svc.scanWebsite("http://192.168.1.1/admin")).rejects.toThrow(BadRequestError);
  });

  it("scanWebsite : site injoignable → reachable false avec erreur, sans throw", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const svc = new OnboardingScanService(
      ctx.db,
      fakeLLM("x"),
      undefined,
      undefined,
      fetchMock as unknown as typeof fetch,
    );

    const scan = await svc.scanWebsite("https://site-mort.fr");
    expect(scan.reachable).toBe(false);
    expect(scan.error).toContain("ECONNREFUSED");
  });

  it("scanGoogleBusiness : sans clé API → found false avec raison", async () => {
    const svc = new OnboardingScanService(ctx.db, fakeLLM("x"));
    const scan = await svc.scanGoogleBusiness("Chez Marcel Lyon");
    expect(scan.found).toBe(false);
    expect(scan.error).toContain("GOOGLE_PLACES_API_KEY");
  });

  it("scanGoogleBusiness : avec clé → note, avis, adresse extraits", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          places: [
            {
              displayName: { text: "Chez Marcel" },
              rating: 4.2,
              userRatingCount: 47,
              formattedAddress: "12 rue de Lyon, 69003 Lyon",
              currentOpeningHours: { openNow: true },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const svc = new OnboardingScanService(
      ctx.db,
      fakeLLM("x"),
      undefined,
      "places-key",
      fetchMock as unknown as typeof fetch,
    );

    const scan = await svc.scanGoogleBusiness("Chez Marcel Lyon");
    expect(scan).toMatchObject({
      found: true,
      name: "Chez Marcel",
      rating: 4.2,
      reviewCount: 47,
      openNow: true,
    });
  });

  it("runDiagnostic : scan + LLM + publication sur le bus", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(HTML, { status: 200 }));
    const llm = fakeLLM(
      "Ton site est correct mais il manque des avis. Je te propose de commencer par les avis.",
    );
    const svc = new OnboardingScanService(
      ctx.db,
      llm,
      new EventBusService(ctx.db),
      undefined,
      fetchMock as unknown as typeof fetch,
    );

    const diagnostic = await svc.runDiagnostic(tenantId, { websiteUrl: "https://chezmarcel.fr" });

    expect(diagnostic.text).toContain("Je te propose");
    expect(diagnostic.website?.title).toBe("Chez Marcel — Boulangerie");
    const sent = llm.complete.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    expect(sent.messages[0]?.content).toContain("Chez Marcel — Boulangerie");

    const start = Date.now();
    let rows: unknown[] = [];
    while (Date.now() - start < 1000) {
      rows = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.type, "onboarding.diagnostic.generated"));
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(rows).toHaveLength(1);
  });

  it("runDiagnostic : sans site ni fiche → 400", async () => {
    const svc = new OnboardingScanService(ctx.db, fakeLLM("x"));
    await expect(svc.runDiagnostic(tenantId, {})).rejects.toThrow(BadRequestError);
  });
});
