import type { Database, JarvisAction } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import type { JarvisTool } from "../jarvis-executor.js";
import type { Notifier } from "../notifier.js";

const SYSTEM_PROMPT = `Tu écris la réponse d'un commerce à l'avis mitigé ou négatif d'un client.

Règles :
- Français, vouvoiement, ton sincère et professionnel. 60 mots maximum.
- Remercie pour le retour, reconnais le problème sans te justifier, propose de revenir.
- Ne promets jamais de remboursement ni de geste commercial chiffré.
- Ne signe pas, n'ajoute pas d'objet — juste le corps de la réponse.`;

/**
 * Tool Jarvis "review.reply" : rédige via LLM une réponse à un avis négatif
 * et l'envoie au client par email.
 *
 * Payload attendu (posé par l'Observer) : { reviewId, rating, comment }.
 * Échoue explicitement (action failed, visible dans le dashboard) si l'avis
 * ou la résa a disparu, si le client n'a pas d'email, ou si le LLM est muet —
 * jamais d'envoi silencieusement dégradé.
 */
export class ReviewReplyTool implements JarvisTool {
  readonly type = "review.reply";

  constructor(
    private readonly db: Database,
    private readonly llm: LLMClient,
    private readonly notifier: Notifier,
  ) {}

  async execute(action: JarvisAction): Promise<Record<string, unknown>> {
    const { reviewId } = action.payload as { reviewId?: string };
    if (!reviewId) throw new Error("payload.reviewId manquant");

    const review = await this.db.query.reservationReviews.findFirst({
      where: (r, { eq, and }) => and(eq(r.id, reviewId), eq(r.tenantId, action.tenantId)),
    });
    if (!review) throw new Error(`avis ${reviewId} introuvable`);

    const reservation = await this.db.query.reservations.findFirst({
      where: (r, { eq }) => eq(r.id, review.reservationId),
    });
    if (!reservation) throw new Error("réservation liée à l'avis introuvable");
    if (!reservation.customerEmail) throw new Error("client sans email — réponse manuelle requise");

    const tenant = await this.db.query.tenants.findFirst({
      where: (t, { eq }) => eq(t.id, action.tenantId),
    });
    if (!tenant) throw new Error("tenant introuvable");

    const response = await this.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Commerce : ${tenant.name}. Client : ${reservation.customerName}.
Avis : ${review.rating}/5${review.comment ? ` — « ${review.comment} »` : " (sans commentaire)"}.`,
        },
      ],
      temperature: 0.4,
      maxOutputTokens: 250,
    });
    const text = response.text?.trim();
    if (!text) throw new Error("le LLM n'a pas produit de réponse");

    const sent = await this.notifier.send({
      tenantId: action.tenantId,
      channel: "email",
      to: reservation.customerEmail,
      subject: `Votre avis sur ${tenant.name}`,
      body: `${text}\n\n— ${tenant.name}`,
      context: { type: "jarvis.review.reply", reviewId, actionId: action.id },
    });
    if (!sent.delivered) throw new Error(`envoi échoué : ${sent.error ?? sent.provider}`);

    return { sentTo: reservation.customerEmail, channel: "email", text };
  }
}
