import { type Database, schema } from "@okito/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { JarvisActionService } from "./jarvis-action.js";
import type { SupplierInvoiceService } from "./supplier-invoice.js";

export interface ObserverRunResult {
  eventsScanned: number;
  actionsProposed: number;
}

/** Fenêtre d'anticipation des échéances fournisseurs (jours). */
const SUPPLIER_DUE_SOON_DAYS = 3;

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
 * Règle 4 — avis Google : un event google.review.submitted (sans réponse
 * existante) déclenche une proposition google.review.reply. On répond à TOUS
 * les avis Google (positifs comme négatifs) : sur une fiche publique, répondre
 * aux avis est une bonne pratique de e-réputation. Dédup sur
 * payload->>'googleReviewName'.
 *
 * Règle 3 — échéance fournisseur : une facture fournisseur non payée dont
 * l'échéance tombe sous 3 jours déclenche supplier_invoice.pay_reminder
 * (rappel email au patron). Scan direct de la table (pas d'event "le temps
 * passe"), dédup sur payload->>'supplierInvoiceId'.
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
    private readonly supplierInvoices?: SupplierInvoiceService,
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
          sql`${schema.events.type} in ('review.submitted', 'invoice.overdue', 'google.review.submitted')`,
        ),
      );
    result.eventsScanned = events.length;

    for (const event of events) {
      if (event.type === "review.submitted") {
        if (await this.handleReview(event.tenantId, event.payload)) result.actionsProposed++;
      } else if (event.type === "invoice.overdue") {
        if (await this.handleOverdueInvoice(event.tenantId, event.payload))
          result.actionsProposed++;
      } else if (event.type === "google.review.submitted") {
        if (await this.handleGoogleReview(event.tenantId, event.payload)) result.actionsProposed++;
      }
    }

    result.actionsProposed += await this.scanSupplierDueSoon(now);

    if (result.actionsProposed > 0) {
      logger.info({ result }, "Jarvis Observer: actions proposées");
    }
    return result;
  }

  /** Règle 3 : factures fournisseurs à échéance sous 3 jours → rappel patron. */
  private async scanSupplierDueSoon(now: Date): Promise<number> {
    if (!this.supplierInvoices) return 0;
    let proposed = 0;
    const tenants = await this.db.query.tenants.findMany({
      columns: { id: true },
      where: (t, { eq: whereEq }) => whereEq(t.status, "active"),
    });
    for (const tenant of tenants) {
      try {
        const due = await this.supplierInvoices.dueSoon(tenant.id, SUPPLIER_DUE_SOON_DAYS, now);
        for (const invoice of due) {
          if (
            await this.alreadyProposed(
              tenant.id,
              "supplier_invoice.pay_reminder",
              "supplierInvoiceId",
              invoice.id,
            )
          ) {
            continue;
          }
          const amount = `${(invoice.amountCents / 100).toFixed(2)} ${invoice.currency}`;
          const dueLabel = invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "?";
          await this.actions.propose(
            tenant.id,
            "supplier_invoice.pay_reminder",
            `Payer ${invoice.supplierName} (${amount}) avant le ${dueLabel}`,
            { supplierInvoiceId: invoice.id, supplierName: invoice.supplierName },
          );
          proposed++;
        }
      } catch (err) {
        // Un tenant en échec ne bloque pas le scan des autres.
        logger.error({ err, tenantId: tenant.id }, "Observer: scan échéances fournisseurs échoué");
      }
    }
    return proposed;
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

  private async handleGoogleReview(tenantId: string, raw: unknown): Promise<boolean> {
    const payload = raw as {
      googleReviewName?: string;
      connectionId?: string;
      rating?: number;
      comment?: string | null;
      hasReply?: boolean;
    };
    if (!payload.googleReviewName || !payload.connectionId) return false;
    // Un avis déjà répondu (par le patron ou une sync précédente) est ignoré.
    if (payload.hasReply) return false;
    if (
      await this.alreadyProposed(
        tenantId,
        "google.review.reply",
        "googleReviewName",
        payload.googleReviewName,
      )
    ) {
      return false;
    }
    const stars = typeof payload.rating === "number" ? `${payload.rating}★` : "avis";
    await this.actions.propose(
      tenantId,
      "google.review.reply",
      `Répondre à l'avis Google ${stars}${payload.comment ? ` — « ${truncate(payload.comment, 80)} »` : ""}`,
      {
        googleReviewName: payload.googleReviewName,
        connectionId: payload.connectionId,
        rating: payload.rating ?? null,
        comment: payload.comment ?? null,
      },
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
