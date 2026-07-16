import type { SiteBlocks, TenantSite } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { OnboardingScanService } from "./onboarding-scan.js";
import type { SiteService } from "./site.js";

const SYSTEM_PROMPT = `Tu écris le contenu du site vitrine d'un commerce français, à partir
des résultats bruts d'un scan de son site actuel et/ou de sa fiche Google.
Réponds UNIQUEMENT avec un objet JSON, sans texte autour, sans balises markdown :

{
  "hero": {
    "title": string,        // nom du commerce (repris des données, jamais inventé)
    "subtitle": string,     // accroche de 8-15 mots, concrète, sans superlatif creux
    "ctaLabel": string      // ex "Réserver", "Prendre rendez-vous"
  },
  "info": {
    "address": string | null,  // adresse si présente dans les données, sinon null
    "hours": string | null     // horaires si présents, sinon null
  },
  "seo": {
    "title": string,        // ≤ 60 caractères, nom + activité + ville si connue
    "description": string   // ≤ 155 caractères, incitation à réserver
  }
}

Règles :
- Français, vouvoiement dans les textes destinés aux clients.
- N'invente JAMAIS une donnée factuelle (adresse, horaires, note) : absente → null.
- Pas d'emoji, pas de point d'exclamation en rafale.`;

const generatedSchema = z.object({
  hero: z.object({
    title: z.string().min(1).max(120),
    subtitle: z.string().min(1).max(200),
    ctaLabel: z.string().min(1).max(40),
  }),
  info: z.object({
    address: z.string().min(1).max(300).nullable(),
    hours: z.string().min(1).max(500).nullable(),
  }),
  seo: z.object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(200),
  }),
});

export type GeneratedSiteContent = z.infer<typeof generatedSchema>;

/**
 * Génération LLM du contenu initial du site vitrine (site builder 4/4).
 *
 * Réutilise les scans de l'onboarding (site existant + fiche Google Places)
 * pour pré-remplir hero / infos pratiques / SEO, puis enregistre le tout en
 * brouillon via SiteService — le patron relit et publie depuis /site.
 * Refuse d'écraser un site déjà rempli sans `force`.
 */
export class SiteGeneratorService {
  constructor(
    private readonly scan: OnboardingScanService,
    private readonly site: SiteService,
    private readonly llm: LLMClient,
  ) {}

  async generate(
    tenantId: string,
    input: { websiteUrl?: string; businessQuery?: string; force?: boolean },
  ): Promise<TenantSite> {
    if (!input.websiteUrl && !input.businessQuery) {
      throw new BadRequestError("Fournir au moins websiteUrl ou businessQuery");
    }

    const existing = await this.site.get(tenantId);
    const heroTitle = (existing?.blocks.hero as { title?: string } | undefined)?.title;
    if (existing && heroTitle && !input.force) {
      throw new BadRequestError(
        "Le site a déjà du contenu — utiliser force pour le régénérer",
        "site_not_empty",
      );
    }

    const [website, business] = await Promise.all([
      input.websiteUrl ? this.scan.scanWebsite(input.websiteUrl) : Promise.resolve(null),
      input.businessQuery
        ? this.scan.scanGoogleBusiness(input.businessQuery)
        : Promise.resolve(null),
    ]);

    const response = await this.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Scan du site actuel : ${website ? JSON.stringify(website) : "non fourni"}
Fiche Google : ${business ? JSON.stringify(business) : "non fournie"}`,
        },
      ],
      temperature: 0.4,
      maxOutputTokens: 700,
    });
    const text = response.text?.trim();
    if (!text) throw new BadRequestError("Le LLM n'a pas produit de contenu", "generation_empty");

    const parsed = generatedSchema.safeParse(parseJson(stripFences(text)));
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "génération site : JSON invalide");
      throw new BadRequestError("Génération illisible — réessaie", "generation_invalid");
    }
    const content = parsed.data;

    const blocks: SiteBlocks = {
      hero: content.hero,
      info: {
        ...(content.info.address ? { address: content.info.address } : {}),
        ...(content.info.hours ? { hours: content.info.hours } : {}),
      },
    };
    return this.site.upsert(tenantId, { blocks, seo: content.seo });
  }
}

/** Gemini emballe parfois le JSON dans un bloc \`\`\`json malgré la consigne. */
function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError("Le LLM n'a pas renvoyé un JSON valide", "generation_invalid");
  }
}
