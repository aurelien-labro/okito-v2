import { type Database, schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";
import type { GoogleBusinessService } from "./google-business.js";

export interface GoogleReviewsSyncRunResult {
  connectionsProcessed: number;
  reviewsIngested: number;
  errors: number;
}

/**
 * Synchronisation des avis Google Business → event bus (boucle 4, V3).
 *
 * Par connexion active : liste les avis de la fiche, publie un event
 * `google.review.submitted` pour chaque avis plus récent que le curseur
 * (updateTime). Première sync = bootstrap du curseur seulement — on
 * n'ingère que les avis reçus APRÈS la connexion, comme Gmail.
 *
 * Chaque connexion est isolée : une erreur marque la connexion (status
 * error + lastError) sans bloquer les autres.
 */
export class GoogleReviewsSyncService {
  constructor(
    private readonly db: Database,
    private readonly googleBusiness: GoogleBusinessService,
    private readonly bus: EventBusService,
  ) {}

  async runOnce(): Promise<GoogleReviewsSyncRunResult> {
    const result: GoogleReviewsSyncRunResult = {
      connectionsProcessed: 0,
      reviewsIngested: 0,
      errors: 0,
    };

    const connections = await this.db
      .select()
      .from(schema.tenantGoogleBusiness)
      .where(eq(schema.tenantGoogleBusiness.status, "active"));

    for (const conn of connections) {
      result.connectionsProcessed++;
      try {
        result.reviewsIngested += await this.syncConnection(
          conn.id,
          conn.tenantId,
          conn.reviewCursor,
        );
      } catch (err) {
        result.errors++;
        const message = err instanceof Error ? err.message : String(err);
        await this.db
          .update(schema.tenantGoogleBusiness)
          .set({ status: "error", lastError: message })
          .where(eq(schema.tenantGoogleBusiness.id, conn.id));
        logger.error({ err, connectionId: conn.id }, "Google reviews sync: connexion en erreur");
      }
    }
    return result;
  }

  private async syncConnection(
    connectionId: string,
    tenantId: string,
    cursor: Date | null,
  ): Promise<number> {
    const reviews = await this.googleBusiness.listReviews(connectionId);
    const newest = reviews.reduce<Date | null>(
      (max, r) => (max === null || r.updateTime > max ? r.updateTime : max),
      null,
    );

    let ingested = 0;
    if (cursor !== null) {
      // Du plus ancien au plus récent pour que le journal reste chronologique.
      const fresh = reviews
        .filter((r) => r.updateTime > cursor)
        .sort((a, b) => a.updateTime.getTime() - b.updateTime.getTime());
      for (const review of fresh) {
        this.bus.publish(
          tenantId,
          "google.review.submitted",
          {
            googleReviewName: review.name,
            rating: review.rating,
            comment: review.comment,
            reviewerName: review.reviewerName,
            hasReply: review.hasReply,
            connectionId,
          },
          "google_business",
        );
        ingested++;
      }
    }

    await this.db
      .update(schema.tenantGoogleBusiness)
      .set({
        // Bootstrap : curseur posé au plus récent (ou à maintenant si fiche
        // sans avis) sans rien publier.
        reviewCursor: newest ?? cursor ?? new Date(),
        lastSyncAt: new Date(),
        lastError: null,
      })
      .where(eq(schema.tenantGoogleBusiness.id, connectionId));
    return ingested;
  }
}
