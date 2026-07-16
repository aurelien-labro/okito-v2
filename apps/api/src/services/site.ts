import {
  type Database,
  SITE_BLOCK_KEYS,
  type SiteBlocks,
  type SiteSeo,
  type TenantSite,
  schema,
} from "@okito/db";
import { eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";

export interface SiteUpsertInput {
  slug?: string;
  theme?: string;
  blocks?: SiteBlocks;
  seo?: SiteSeo;
}

/** Site publié + infos publiques du tenant, pour le rendu SSR. */
export interface PublicSite {
  slug: string;
  theme: string;
  blocks: SiteBlocks;
  seo: SiteSeo;
  publishedAt: Date | null;
  tenant: {
    id: string;
    name: string;
    contactPhone: string | null;
    branding: Record<string, unknown>;
  };
}

/**
 * Site builder (vague 3) — un site vitrine mono-page par tenant.
 *
 * Les blocs sont du jsonb libre validé en surface par la route (clés
 * whitelistées) ; le rendu décide quoi afficher. Seul un site `published`
 * est servi publiquement, et la publication passe par l'event bus
 * (`site.published`) pour le journal Jarvis.
 */
export class SiteService {
  constructor(
    private readonly db: Database,
    private readonly bus?: EventBusService,
  ) {}

  async get(tenantId: string): Promise<TenantSite | null> {
    const row = await this.db.query.tenantSites.findFirst({
      where: (s, { eq: e }) => e(s.tenantId, tenantId),
    });
    return row ?? null;
  }

  /**
   * Crée ou met à jour le site du tenant (toujours en un seul exemplaire).
   * À la création sans slug fourni, le slug interne du tenant sert de défaut.
   */
  async upsert(tenantId: string, input: SiteUpsertInput): Promise<TenantSite> {
    if (input.blocks) assertKnownBlocks(input.blocks);

    const existing = await this.get(tenantId);
    const slug = input.slug !== undefined ? normalizeSlug(input.slug) : undefined;
    if (slug !== undefined) await this.assertSlugFree(slug, existing?.id);

    if (!existing) {
      const tenant = await this.db.query.tenants.findFirst({
        where: (t, { eq: e }) => e(t.id, tenantId),
      });
      if (!tenant) throw new NotFoundError("Tenant introuvable");
      const defaultSlug = slug ?? normalizeSlug(tenant.slug);
      if (slug === undefined) await this.assertSlugFree(defaultSlug);
      const [row] = await this.db
        .insert(schema.tenantSites)
        .values({
          tenantId,
          slug: defaultSlug,
          theme: input.theme ?? "okito",
          blocks: input.blocks ?? {},
          seo: input.seo ?? {},
        })
        .returning();
      if (!row) throw new Error("insert tenant_sites failed");
      return row;
    }

    const [row] = await this.db
      .update(schema.tenantSites)
      .set({
        ...(slug !== undefined ? { slug } : {}),
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.blocks !== undefined ? { blocks: input.blocks } : {}),
        ...(input.seo !== undefined ? { seo: input.seo } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.tenantSites.id, existing.id))
      .returning();
    if (!row) throw new Error("update tenant_sites failed");
    return row;
  }

  async publish(tenantId: string, now = new Date()): Promise<TenantSite> {
    const existing = await this.get(tenantId);
    if (!existing) throw new NotFoundError("Aucun site à publier");
    const [row] = await this.db
      .update(schema.tenantSites)
      .set({ status: "published", publishedAt: now, updatedAt: now })
      .where(eq(schema.tenantSites.id, existing.id))
      .returning();
    if (!row) throw new Error("publish tenant_sites failed");

    this.bus?.publish(tenantId, "site.published", { slug: row.slug }, "site");
    logger.info({ tenantId, slug: row.slug }, "Site publié");
    return row;
  }

  async unpublish(tenantId: string, now = new Date()): Promise<TenantSite> {
    const existing = await this.get(tenantId);
    if (!existing) throw new NotFoundError("Aucun site");
    const [row] = await this.db
      .update(schema.tenantSites)
      .set({ status: "draft", updatedAt: now })
      .where(eq(schema.tenantSites.id, existing.id))
      .returning();
    if (!row) throw new Error("unpublish tenant_sites failed");
    return row;
  }

  /** Site publié par slug, avec les infos publiques du tenant (rendu SSR). */
  async getPublishedBySlug(slug: string): Promise<PublicSite | null> {
    const site = await this.db.query.tenantSites.findFirst({
      where: (s, { and: a, eq: e }) => a(e(s.slug, normalizeSlug(slug)), e(s.status, "published")),
    });
    if (!site) return null;
    const tenant = await this.db.query.tenants.findFirst({
      where: (t, { eq: e }) => e(t.id, site.tenantId),
    });
    if (!tenant) return null;
    return {
      slug: site.slug,
      theme: site.theme,
      blocks: site.blocks,
      seo: site.seo,
      publishedAt: site.publishedAt,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        contactPhone: tenant.contactPhone,
        branding: (tenant.branding ?? {}) as Record<string, unknown>,
      },
    };
  }

  private async assertSlugFree(slug: string, ownSiteId?: string): Promise<void> {
    const clash = await this.db.query.tenantSites.findFirst({
      where: (s, { eq: e }) => e(s.slug, slug),
    });
    if (clash && clash.id !== ownSiteId) {
      throw new BadRequestError("Ce slug est déjà pris", "site_slug_taken");
    }
  }
}

/** Slug public : minuscules, a-z0-9 et tirets, 2-60 caractères. */
export function normalizeSlug(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  if (slug.length < 2 || slug.length > 60) {
    throw new BadRequestError("Slug invalide (2-60 caractères, a-z 0-9 -)", "site_slug_invalid");
  }
  return slug;
}

function assertKnownBlocks(blocks: SiteBlocks): void {
  const known = new Set<string>(SITE_BLOCK_KEYS);
  for (const key of Object.keys(blocks)) {
    if (!known.has(key)) {
      throw new BadRequestError(`Bloc inconnu : ${key}`, "site_unknown_block");
    }
  }
}
