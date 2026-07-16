import {
  type Campaign,
  type CampaignChannel,
  type CampaignSegment,
  type Database,
  schema,
} from "@okito/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";
import type { Notifier } from "./notifier.js";

/** Borne dure de destinataires par envoi (garde-fou anti-spam). */
const MAX_RECIPIENTS_PER_SEND = 500;
/** Habitué = 3+ visites (même seuil que la fidélité). */
const REGULARS_THRESHOLD = 3;
/** Récent = venu dans les 30 derniers jours ; dormant = pas venu depuis 60 j. */
const RECENT_DAYS = 30;
const DORMANT_DAYS = 60;

export interface CampaignRecipient {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
}

export interface CampaignCreateInput {
  name: string;
  channel: CampaignChannel;
  segment: CampaignSegment;
  subject?: string | null;
  body: string;
}

export interface CampaignSendResult {
  campaign: Campaign;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

/**
 * Campagnes marketing segmentées (vague 3).
 *
 * Segments calculés à la volée depuis les réservations (source de vérité,
 * même parti pris que la fidélité). Envoi synchrone via le Notifier, borné à
 * 500 destinataires par campagne ; chaque envoi publie `campaign.sent` sur
 * l'event bus (journal de Jarvis).
 */
export class CampaignService {
  constructor(
    private readonly db: Database,
    private readonly notifier: Notifier,
    private readonly bus?: EventBusService,
  ) {}

  /** Destinataires d'un segment — clients avec résa confirmed/completed. */
  async resolveSegment(
    tenantId: string,
    segment: CampaignSegment,
    now = new Date(),
  ): Promise<CampaignRecipient[]> {
    const rows = await this.db
      .select({
        customerPhone: schema.reservations.customerPhone,
        customerName: sql<string>`max(${schema.reservations.customerName})`,
        customerEmail: sql<string | null>`max(${schema.reservations.customerEmail})`,
        visitCount: sql<number>`count(*)::int`,
        lastVisit: sql<string>`max(${schema.reservations.dateReservation})::text`,
      })
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.tenantId, tenantId),
          inArray(schema.reservations.status, ["confirmed", "completed"]),
        ),
      )
      .groupBy(schema.reservations.customerPhone);

    const dayMs = 24 * 3600 * 1000;
    return rows
      .filter((r) => {
        const last = new Date(r.lastVisit).getTime();
        switch (segment) {
          case "all":
            return true;
          case "regulars":
            return r.visitCount >= REGULARS_THRESHOLD;
          case "recent":
            return now.getTime() - last <= RECENT_DAYS * dayMs;
          case "dormant":
            return now.getTime() - last > DORMANT_DAYS * dayMs;
        }
      })
      .map((r) => ({
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        customerEmail: r.customerEmail,
      }));
  }

  /** Compte par segment pour l'UI (aperçu avant création). */
  async segmentCounts(
    tenantId: string,
    now = new Date(),
  ): Promise<Record<CampaignSegment, number>> {
    const [all, regulars, recent, dormant] = await Promise.all([
      this.resolveSegment(tenantId, "all", now),
      this.resolveSegment(tenantId, "regulars", now),
      this.resolveSegment(tenantId, "recent", now),
      this.resolveSegment(tenantId, "dormant", now),
    ]);
    return {
      all: all.length,
      regulars: regulars.length,
      recent: recent.length,
      dormant: dormant.length,
    };
  }

  async create(tenantId: string, input: CampaignCreateInput): Promise<Campaign> {
    if (input.channel === "email" && !input.subject?.trim()) {
      throw new BadRequestError(
        "Sujet requis pour une campagne email",
        "campaign_subject_required",
      );
    }
    const [row] = await this.db
      .insert(schema.campaigns)
      .values({
        tenantId,
        name: input.name.trim(),
        channel: input.channel,
        segment: input.segment,
        subject: input.subject?.trim() || null,
        body: input.body.trim(),
      })
      .returning();
    if (!row) throw new Error("insert campaigns failed");
    return row;
  }

  async list(tenantId: string): Promise<Campaign[]> {
    return this.db.query.campaigns.findMany({
      where: (c, { eq: e }) => e(c.tenantId, tenantId),
      orderBy: (c) => [desc(c.createdAt)],
    });
  }

  /**
   * Envoie une campagne draft : résout le segment, filtre les destinataires
   * joignables sur le canal (email présent / téléphone), envoie un par un
   * (une erreur n'arrête pas les autres), fige les compteurs.
   */
  async send(tenantId: string, campaignId: string, now = new Date()): Promise<CampaignSendResult> {
    const campaign = await this.db.query.campaigns.findFirst({
      where: (c, { and: a, eq: e }) => a(e(c.id, campaignId), e(c.tenantId, tenantId)),
    });
    if (!campaign) throw new NotFoundError("Campagne introuvable");
    if (campaign.status !== "draft") {
      throw new BadRequestError("Campagne déjà envoyée", "campaign_already_sent");
    }

    const everyone = await this.resolveSegment(tenantId, campaign.segment, now);
    const reachable = everyone.filter((r) =>
      campaign.channel === "email" ? !!r.customerEmail : !!r.customerPhone,
    );
    const recipients = reachable.slice(0, MAX_RECIPIENTS_PER_SEND);

    let sentCount = 0;
    let failedCount = 0;
    for (const r of recipients) {
      try {
        const result = await this.notifier.send({
          tenantId,
          channel: campaign.channel,
          to: campaign.channel === "email" ? (r.customerEmail as string) : r.customerPhone,
          subject: campaign.subject ?? undefined,
          body: personalize(campaign.body, r),
          context: { campaignId: campaign.id, segment: campaign.segment, kind: "campaign" },
        });
        if (result.delivered) sentCount++;
        else failedCount++;
      } catch (err) {
        failedCount++;
        logger.warn({ err, campaignId }, "Campagne : envoi destinataire échoué");
      }
    }

    const [updated] = await this.db
      .update(schema.campaigns)
      .set({
        status: "sent",
        recipientCount: recipients.length,
        sentCount,
        failedCount,
        sentAt: now,
      })
      .where(eq(schema.campaigns.id, campaign.id))
      .returning();
    if (!updated) throw new Error("update campaigns failed");

    this.bus?.publish(
      tenantId,
      "campaign.sent",
      {
        campaignId: campaign.id,
        name: campaign.name,
        channel: campaign.channel,
        segment: campaign.segment,
        recipientCount: recipients.length,
        sentCount,
        failedCount,
      },
      "marketing",
    );
    logger.info({ campaignId, sentCount, failedCount }, "Campagne envoyée");

    return { campaign: updated, recipientCount: recipients.length, sentCount, failedCount };
  }

  async removeDraft(tenantId: string, campaignId: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.id, campaignId),
          eq(schema.campaigns.tenantId, tenantId),
          eq(schema.campaigns.status, "draft"),
        ),
      )
      .returning({ id: schema.campaigns.id });
    if (!row) throw new NotFoundError("Brouillon introuvable (déjà envoyé ?)");
  }
}

/** Substitue {prenom} par le prénom du client (1er mot du nom connu). */
function personalize(body: string, r: CampaignRecipient): string {
  const firstName = r.customerName.trim().split(/\s+/)[0] ?? "";
  return body.replaceAll("{prenom}", firstName);
}
