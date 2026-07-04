import { type Database, schema } from "@okito/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { JarvisActionService } from "./jarvis-action.js";

export interface ObserverRunResult {
  eventsScanned: number;
  actionsProposed: number;
}

/** Note en dessous de laquelle un avis mérite une réponse rapide du patron. */
const NEGATIVE_RATING_MAX = 3;

/**
 * Observer Jarvis v1 (fondation V3) : règles déterministes sur le journal
 * d'événements → propositions d'actions gouvernées par les garde-fous.
 *
 * Règle 1 — avis négatif : un event review.submitted avec rating ≤ 3 dans la
 * fenêtre scannée déclenche une proposition review.reply (auto_cancellable :
 * exécutée après la fenêtre de retrait sauf si le patron annule).
 *
 * Idempotent : une action review.reply n'est proposée qu'une fois par avis
 * (dédup sur payload->>'reviewId'), le cron peut donc rescanner large.
 * Les règles LLM (détection d'anomalies) viendront en v2.
 */
export class JarvisObserverService {
  constructor(
    private readonly db: Database,
    private readonly actions: JarvisActionService,
    private readonly windowHours = 2,
  ) {}

  async runOnce(now = new Date()): Promise<ObserverRunResult> {
    const result: ObserverRunResult = { eventsScanned: 0, actionsProposed: 0 };
    const since = new Date(now.getTime() - this.windowHours * 3600_000);

    const reviews = await this.db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.type, "review.submitted"), gte(schema.events.createdAt, since)));
    result.eventsScanned = reviews.length;

    for (const event of reviews) {
      const payload = event.payload as {
        reviewId?: string;
        rating?: number;
        comment?: string | null;
      };
      if (!payload.reviewId || typeof payload.rating !== "number") continue;
      if (payload.rating > NEGATIVE_RATING_MAX) continue;

      if (await this.alreadyProposed(event.tenantId, payload.reviewId)) continue;

      await this.actions.propose(
        event.tenantId,
        "review.reply",
        `Répondre à l'avis ${payload.rating}★${payload.comment ? ` — « ${truncate(payload.comment, 80)} »` : ""}`,
        { reviewId: payload.reviewId, rating: payload.rating, comment: payload.comment ?? null },
      );
      result.actionsProposed++;
    }

    if (result.actionsProposed > 0) {
      logger.info({ result }, "Jarvis Observer: actions proposées");
    }
    return result;
  }

  private async alreadyProposed(tenantId: string, reviewId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.jarvisActions.id })
      .from(schema.jarvisActions)
      .where(
        and(
          eq(schema.jarvisActions.tenantId, tenantId),
          eq(schema.jarvisActions.type, "review.reply"),
          sql`${schema.jarvisActions.payload}->>'reviewId' = ${reviewId}`,
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
