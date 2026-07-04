import type { Database } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import { BadRequestError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { isSafePublicUrl } from "../lib/ssrf.js";
import type { EventBusService } from "./event-bus.js";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 500_000;

export interface WebsiteScan {
  url: string;
  reachable: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  https: boolean;
  title: string | null;
  metaDescription: string | null;
  hasViewportMeta: boolean;
  htmlBytes: number | null;
  error?: string;
}

export interface GoogleBusinessScan {
  found: boolean;
  name: string | null;
  rating: number | null;
  reviewCount: number | null;
  address: string | null;
  openNow: boolean | null;
  error?: string;
}

export interface OnboardingDiagnostic {
  tenantId: string;
  text: string;
  website: WebsiteScan | null;
  business: GoogleBusinessScan | null;
  generatedAt: Date;
}

const DIAGNOSTIC_PROMPT = `Tu es Jarvis, l'assistant de pilotage d'un commerce.
Le patron vient de connecter son commerce : voici les résultats bruts du scan
de son site web et de sa fiche Google. Écris ton premier diagnostic.

Règles :
- Français, tutoiement, ton direct d'expert bienveillant. 150 mots maximum.
- Commence par ce qui va bien (une phrase), puis les 2-3 problèmes les plus
  impactants, classés par gravité, avec le chiffre qui le prouve.
- Termine par : "Je te propose de commencer par [action la plus rentable]."
- N'invente jamais un chiffre : ne cite que les données du scan.
- Un site > 3 s de chargement, sans meta description, sans viewport mobile,
  ou en HTTP simple sont des problèmes concrets à signaler.
- Une note Google < 4,5 ou peu d'avis (< 30) méritent une action avis.`;

/**
 * Onboarding magique (vague 1) : scan du site + fiche Google Places →
 * premier diagnostic LLM, publié sur le bus (onboarding.diagnostic.generated).
 *
 * Le scan site est fait maison (fetch + parsing regex léger — pas de
 * headless browser en v1) : temps de réponse, HTTPS, title, meta
 * description, viewport mobile, poids HTML. La fiche Google passe par
 * l'API Places (clé optionnelle : sans clé, le diagnostic se fait sur le
 * site seul).
 */
export class OnboardingScanService {
  constructor(
    private readonly db: Database,
    private readonly llm: LLMClient,
    private readonly bus?: EventBusService,
    private readonly placesApiKey?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async runDiagnostic(
    tenantId: string,
    input: { websiteUrl?: string; businessQuery?: string },
  ): Promise<OnboardingDiagnostic> {
    if (!input.websiteUrl && !input.businessQuery) {
      throw new BadRequestError("Fournir au moins websiteUrl ou businessQuery");
    }

    const [website, business] = await Promise.all([
      input.websiteUrl ? this.scanWebsite(input.websiteUrl) : Promise.resolve(null),
      input.businessQuery ? this.scanGoogleBusiness(input.businessQuery) : Promise.resolve(null),
    ]);

    const response = await this.llm.complete({
      system: DIAGNOSTIC_PROMPT,
      messages: [
        {
          role: "user",
          content: `Scan du site : ${website ? JSON.stringify(website) : "non fourni"}
Fiche Google : ${business ? JSON.stringify(business) : "non fournie"}`,
        },
      ],
      temperature: 0.3,
      maxOutputTokens: 500,
    });
    const text = response.text?.trim();
    if (!text)
      throw new BadRequestError("Le LLM n'a pas produit de diagnostic", "diagnostic_empty");

    const diagnostic: OnboardingDiagnostic = {
      tenantId,
      text,
      website,
      business,
      generatedAt: new Date(),
    };
    this.bus?.publish(
      tenantId,
      "onboarding.diagnostic.generated",
      { text, website, business },
      "jarvis",
    );
    return diagnostic;
  }

  async scanWebsite(rawUrl: string): Promise<WebsiteScan> {
    const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    if (!isSafePublicUrl(url)) {
      throw new BadRequestError("URL de site invalide ou non publique", "unsafe_url");
    }

    const scan: WebsiteScan = {
      url,
      reachable: false,
      httpStatus: null,
      responseTimeMs: null,
      https: url.startsWith("https:"),
      title: null,
      metaDescription: null,
      hasViewportMeta: false,
      htmlBytes: null,
    };

    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { "User-Agent": "OkitoJarvis/1.0 (diagnostic; +https://okito.app)" },
        redirect: "follow",
      }).finally(() => clearTimeout(timer));

      scan.responseTimeMs = Date.now() - started;
      scan.httpStatus = res.status;
      scan.reachable = res.ok;
      if (!res.ok) return scan;

      const html = (await res.text()).slice(0, MAX_HTML_BYTES);
      scan.htmlBytes = html.length;
      scan.title = matchFirst(html, /<title[^>]*>([^<]*)<\/title>/i);
      scan.metaDescription =
        matchFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
        matchFirst(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
      scan.hasViewportMeta = /<meta[^>]+name=["']viewport["']/i.test(html);
      return scan;
    } catch (err) {
      scan.responseTimeMs = Date.now() - started;
      scan.error = err instanceof Error ? err.message : String(err);
      logger.warn({ url, err: scan.error }, "Onboarding: site injoignable");
      return scan;
    }
  }

  async scanGoogleBusiness(query: string): Promise<GoogleBusinessScan> {
    if (!this.placesApiKey) {
      return {
        found: false,
        name: null,
        rating: null,
        reviewCount: null,
        address: null,
        openNow: null,
        error: "GOOGLE_PLACES_API_KEY non configurée",
      };
    }

    try {
      const res = await this.fetchImpl("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.placesApiKey,
          "X-Goog-FieldMask":
            "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.currentOpeningHours.openNow",
        },
        body: JSON.stringify({ textQuery: query, languageCode: "fr", maxResultCount: 1 }),
      });
      if (!res.ok) throw new Error(`Places API HTTP ${res.status}`);

      const data = (await res.json()) as {
        places?: Array<{
          displayName?: { text?: string };
          rating?: number;
          userRatingCount?: number;
          formattedAddress?: string;
          currentOpeningHours?: { openNow?: boolean };
        }>;
      };
      const place = data.places?.[0];
      if (!place) {
        return {
          found: false,
          name: null,
          rating: null,
          reviewCount: null,
          address: null,
          openNow: null,
        };
      }
      return {
        found: true,
        name: place.displayName?.text ?? null,
        rating: place.rating ?? null,
        reviewCount: place.userRatingCount ?? null,
        address: place.formattedAddress ?? null,
        openNow: place.currentOpeningHours?.openNow ?? null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ query, err: message }, "Onboarding: fiche Google injoignable");
      return {
        found: false,
        name: null,
        rating: null,
        reviewCount: null,
        address: null,
        openNow: null,
        error: message,
      };
    }
  }
}

function matchFirst(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m?.[1]?.trim() || null;
}
