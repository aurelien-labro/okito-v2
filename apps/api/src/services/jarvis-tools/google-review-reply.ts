import type { JarvisAction } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import type { GoogleBusinessService } from "../google-business.js";
import type { JarvisTool } from "../jarvis-executor.js";

const SYSTEM_PROMPT = `Tu écris la réponse PUBLIQUE d'un commerce à un avis laissé sur sa fiche Google.

Règles :
- Français, vouvoiement, ton sincère et professionnel. 60 mots maximum.
- Pour un avis négatif : remercie pour le retour, reconnais le problème sans te justifier, invite à revenir ou à te contacter en privé.
- Pour un avis positif : remercie chaleureusement et brièvement, sans en faire trop.
- Ne promets jamais de remboursement ni de geste commercial chiffré.
- Cette réponse est visible par tous : reste courtois même si l'avis est injuste.
- Ne signe pas, n'ajoute pas d'objet — juste le corps de la réponse.`;

/**
 * Tool Jarvis "google.review.reply" : rédige via LLM une réponse à un avis
 * Google et la publie sur la fiche via l'API Business Profile.
 *
 * Payload attendu (posé par l'Observer) : { googleReviewName, connectionId,
 * rating, comment }. Échoue explicitement (action failed, visible dans le
 * dashboard) si le LLM est muet ou si la publication Google échoue — jamais
 * de réponse silencieusement perdue.
 */
export class GoogleReviewReplyTool implements JarvisTool {
  readonly type = "google.review.reply";

  constructor(
    private readonly llm: LLMClient,
    private readonly googleBusiness: GoogleBusinessService,
  ) {}

  async execute(action: JarvisAction): Promise<Record<string, unknown>> {
    const { googleReviewName, connectionId, rating, comment } = action.payload as {
      googleReviewName?: string;
      connectionId?: string;
      rating?: number;
      comment?: string | null;
    };
    if (!googleReviewName) throw new Error("payload.googleReviewName manquant");
    if (!connectionId) throw new Error("payload.connectionId manquant");

    const response = await this.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Avis : ${rating ?? "?"}/5${comment ? ` — « ${comment} »` : " (sans commentaire)"}.`,
        },
      ],
      temperature: 0.4,
      maxOutputTokens: 250,
    });
    const text = response.text?.trim();
    if (!text) throw new Error("le LLM n'a pas produit de réponse");

    await this.googleBusiness.replyToReview(connectionId, googleReviewName, text);

    return { googleReviewName, published: true, text };
  }
}
