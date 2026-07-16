import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SiteService, normalizeSlug } from "./site.js";

describe("SiteService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "le-bistrot", name: "Le Bistrot", contactPhone: "+33123456789" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  it("upsert : crée un brouillon avec le slug du tenant par défaut, puis met à jour", async () => {
    const svc = new SiteService(ctx.db);
    const created = await svc.upsert(tenantId, {
      blocks: { hero: { title: "Bienvenue" } },
    });
    expect(created.slug).toBe("le-bistrot");
    expect(created.status).toBe("draft");
    expect(created.blocks).toEqual({ hero: { title: "Bienvenue" } });

    const updated = await svc.upsert(tenantId, {
      slug: "Le Bistrot de Paris",
      seo: { title: "Le Bistrot — Paris" },
    });
    expect(updated.id).toBe(created.id);
    expect(updated.slug).toBe("le-bistrot-de-paris");
    // Les blocs non fournis ne sont pas écrasés.
    expect(updated.blocks).toEqual({ hero: { title: "Bienvenue" } });
    expect(updated.seo).toEqual({ title: "Le Bistrot — Paris" });
  });

  it("upsert : refuse un bloc inconnu et un slug déjà pris", async () => {
    const svc = new SiteService(ctx.db);
    await expect(svc.upsert(tenantId, { blocks: { evil: {} } as never })).rejects.toThrow(
      /bloc inconnu/i,
    );

    const [other] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "autre", name: "Autre" })
      .returning();
    if (!other) throw new Error("tenant insert failed");
    await svc.upsert(other.id, { slug: "pris" });
    await expect(svc.upsert(tenantId, { slug: "pris" })).rejects.toThrow(/déjà pris/i);
  });

  it("publish/unpublish : cycle de statut, visible publiquement seulement si publié", async () => {
    const svc = new SiteService(ctx.db);
    await svc.upsert(tenantId, { blocks: { hero: { title: "Salut" } } });

    expect(await svc.getPublishedBySlug("le-bistrot")).toBeNull();

    const published = await svc.publish(tenantId);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeInstanceOf(Date);

    const site = await svc.getPublishedBySlug("le-bistrot");
    expect(site).toMatchObject({
      slug: "le-bistrot",
      blocks: { hero: { title: "Salut" } },
      tenant: { name: "Le Bistrot", contactPhone: "+33123456789" },
    });

    await svc.unpublish(tenantId);
    expect(await svc.getPublishedBySlug("le-bistrot")).toBeNull();
  });

  it("publish sans site : 404", async () => {
    const svc = new SiteService(ctx.db);
    await expect(svc.publish(tenantId)).rejects.toThrow(/aucun site/i);
  });

  it("normalizeSlug : accents, espaces, bornes de longueur", () => {
    expect(normalizeSlug("Chez Émile & Fils ")).toBe("chez-emile-fils");
    expect(normalizeSlug("--déjà--")).toBe("deja");
    expect(() => normalizeSlug("a")).toThrow(/invalide/i);
    expect(() => normalizeSlug("x".repeat(61))).toThrow(/invalide/i);
  });
});
