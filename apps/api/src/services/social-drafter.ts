import type { LLMClient } from "@okito/shared/llm";
import { z } from "zod";
import { logger } from "../lib/logger.js";

/**
 * Skill Social (v1) : drafter LLM.
 *
 * À partir d'une note libre du patron ("nouveau plat au menu ce soir",
 * "photo de la nouvelle terrasse"), Jarvis rédige la légende, propose des
 * hashtags pertinents et un conseil d'usage (moment de post, canal préféré).
 *
 * v1 : pas de programmation ni de publication automatique. Le contenu est
 * prêt à copier-coller dans Instagram / Facebook / Google Business Profile.
 * La programmation multi-canal viendra dans une PR suivante avec une table
 * dédiée et les tokens OAuth par plateforme.
 */

export const SOCIAL_TONES = ["chaleureux", "expert", "malicieux"] as const;
export type SocialTone = (typeof SOCIAL_TONES)[number];

const SYSTEM_PROMPT = `Tu es Jarvis, rédacteur social pour un commerce français de proximité.
À partir d'une note libre du patron, tu produis une publication prête à poster.

Règles :
- Réponds UNIQUEMENT avec un objet JSON strict, sans texte autour, sans balises markdown.
- Format : {"caption": string, "hashtags": string[], "callToAction": string, "warnings": string[]}.
- caption : légende Instagram/Facebook, tutoiement, français, 220 caractères max, un émoji maximum, PAS de promesse chiffrée sur les résultats client ("le meilleur", "100 %", "garanti").
- hashtags : 8 à 12 hashtags pertinents pour le commerce et sa zone. Format "#exemple" (avec le #). Un mot par hashtag.
- callToAction : suggestion actionnable pour le patron ("poste plutôt jeudi 18h30, meilleur créneau pour ton audience"). Une phrase.
- warnings : liste courte des points à revoir si nécessaire (RGPD, mention légale, retouche photo). Tableau vide si RAS.`;

const draftSchema = z.object({
  caption: z.string().min(1).max(300),
  hashtags: z
    .array(
      z
        .string()
        .regex(/^#[\p{L}0-9_]+$/u, "hashtag mal formé")
        .max(50),
    )
    .min(3)
    .max(15),
  callToAction: z.string().min(1).max(300),
  warnings: z.array(z.string().min(1).max(200)).max(5),
});

export type SocialDraft = z.infer<typeof draftSchema>;

export interface SocialDrafterInput {
  /** Note libre du patron (idée de post, contexte, angle). */
  note: string;
  /** Ton souhaité — défaut "chaleureux". */
  tone?: SocialTone;
  /** Nom du commerce (contexte pour la légende). */
  tenantName?: string;
}

export class SocialDrafterService {
  constructor(private readonly llm: LLMClient) {}

  async draft(input: SocialDrafterInput): Promise<SocialDraft | null> {
    const tone: SocialTone = input.tone ?? "chaleureux";
    const context = [
      input.tenantName ? `Commerce : ${input.tenantName}.` : null,
      `Ton demandé : ${tone}.`,
      `Note du patron :\n${input.note.trim()}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await this.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: context }],
      temperature: 0.7,
      maxOutputTokens: 500,
    });

    const raw = response.text?.trim();
    if (!raw) {
      logger.warn("SocialDrafter: LLM muet");
      return null;
    }
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      logger.warn({ raw: stripped.slice(0, 200) }, "SocialDrafter: JSON invalide");
      return null;
    }
    const result = draftSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ issues: result.error.issues }, "SocialDrafter: schema invalide");
      return null;
    }
    return result.data;
  }
}
