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

    const events = await this.db
      .select()
      .from(schema.events)
      .where(
        and(
          gte(schema.events.createdAt, since),
          sql`${schema.events.type} in ('review.submitted', 'invoice.overdue')`,
        ),
      );
    result.eventsScanned = events.length;

    for (const event of events) {
      if (event.type === "review.submitted") {
        if (await this.handleReview(event.tenantId, event.payload)) result.actionsProposed++;
      } else if (event.type === "invoice.overdue") {
        if (await this.handleOverdueInvoice(event.tenantId, event.payload))
          result.actionsProposed++;
      }
    }

    if (result.actionsProposed > 0) {
      logger.info({ result }, "Jarvis Observer: actions proposées");
    }
    return result;
  }

  private async handleReview(tenantId: string, raw: unknown): Promise<boolean> {
    const payload = raw as { reviewId?: string; rating?: number; comment?: string | null };
    if (!payload.reviewId || typeof payload.rating !== "number") return false;
    if (payload.rating > NEGATIVE_RATING_MAX) return false;
    if (await this.alreadyProposed(tenantId, "review.reply", "reviewId", payload.reviewId)) {
      return false;
    }
    await this.actions.propose(
      tenantId,
      "review.reply",
      `Répondre à l'avis ${payload.rating}★${payload.comment ? ` — « ${truncate(payload.comment, 80)} »` : ""}`,
      { reviewId: payload.reviewId, rating: payload.rating, comment: payload.comment ?? null },
    );
    return true;
  }

  private async handleOverdueInvoice(tenantId: string, raw: unknown): Promise<boolean> {
    const payload = raw as {
      invoiceId?: string;
      number?: string;
      amountCents?: number;
      currency?: string;
      customerName?: string;
    };
    if (!payload.invoiceId) return false;
    if (await this.alreadyProposed(tenantId, "invoice.remind", "invoiceId", payload.invoiceId)) {
      return false;
    }
    const amount =
      typeof payload.amountCents === "number"
        ? `${(payload.amountCents / 100).toFixed(2)} ${payload.currency ?? "EUR"}`
        : "";
    await this.actions.propose(
      tenantId,
      "invoice.remind",
      `Relancer la facture ${payload.number ?? ""} — ${payload.customerName ?? "client"}${amount ? ` (${amount})` : ""}`,
      { invoiceId: payload.invoiceId, number: payload.number },
    );
    return true;
  }

  private async alreadyProposed(
    tenantId: string,
    type: string,
    key: string,
    value: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.jarvisActions.id })
      .from(schema.jarvisActions)
      .where(
        and(
          eq(schema.jarvisActions.tenantId, tenantId),
          eq(schema.jarvisActions.type, type),
          sql`${schema.jarvisActions.payload}->>${key} = ${value}`,
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
