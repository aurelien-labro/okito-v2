import { type Database, type JarvisAction, type JarvisPolicy, schema } from "@okito/db";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import type { EventBusService } from "./event-bus.js";
import type { JarvisToolSettingsService } from "./jarvis-tool-settings.js";

/**
 * Politique par défaut par type d'action. Un type inconnu tombe sur
 * "approval" : dans le doute, Jarvis demande — jamais l'inverse.
 */
const DEFAULT_POLICIES: Record<string, JarvisPolicy> = {
  "reservation.confirm": "auto",
  "reminder.send": "auto",
  "review.reply": "auto_cancellable",
  "google.review.reply": "auto_cancellable",
  "invoice.remind": "auto_cancellable",
  "supplier_invoice.pay_reminder": "auto_cancellable",
  "email.reply": "auto_cancellable",
};
const FALLBACK_POLICY: JarvisPolicy = "approval";

/**
 * Garde-fous des actions Jarvis (fondation V3).
 *
 * Gère le cycle de vie complet d'une action proposée par l'agent, sans
 * l'exécuter lui-même (l'Executor viendra consommer listExecutable) :
 *
 *   propose → auto             : scheduled, exécutable immédiatement
 *           → auto_cancellable : scheduled, fenêtre de retrait de N minutes
 *           → approval         : awaiting_approval, bloquée jusqu'à approve
 *
 * Chaque transition est publiée sur l'event bus (jarvis.action.*) pour
 * alimenter le panneau "Jarvis a agi pour toi" et la timeline client.
 */
export class JarvisActionService {
  constructor(
    private readonly db: Database,
    private readonly bus?: EventBusService,
    private readonly cancelWindowMinutes = 24 * 60,
    private readonly policies: Record<string, JarvisPolicy> = DEFAULT_POLICIES,
    private readonly toolSettings?: JarvisToolSettingsService,
  ) {}

  async propose(
    tenantId: string,
    type: string,
    summary: string,
    payload: Record<string, unknown> = {},
  ): Promise<JarvisAction> {
    // Le patron peut forcer la politique d'un tool depuis la boutique
    // d'automatisations ; sinon, défaut du code.
    const override = await this.toolSettings?.policyOverride(tenantId, type);
    const policy = override ?? this.policies[type] ?? FALLBACK_POLICY;
    const status = policy === "approval" ? "awaiting_approval" : "scheduled";
    const cancellableUntil =
      policy === "auto_cancellable"
        ? new Date(Date.now() + this.cancelWindowMinutes * 60_000)
        : null;

    const [row] = await this.db
      .insert(schema.jarvisActions)
      .values({ tenantId, type, summary, policy, status, payload, cancellableUntil })
      .returning();
    if (!row) throw new Error("insert jarvis_action failed");

    this.publish(row, "jarvis.action.proposed");
    return row;
  }

  /** Le patron valide une action en attente : elle devient exécutable. */
  async approve(tenantId: string, id: string): Promise<JarvisAction> {
    const action = await this.get(tenantId, id);
    if (action.status !== "awaiting_approval") {
      throw new BadRequestError(`Action ${action.status}, seule awaiting_approval est approuvable`);
    }
    const row = await this.transition(tenantId, id, { status: "scheduled" });
    this.publish(row, "jarvis.action.approved");
    return row;
  }

  /** Le patron retire une action avant exécution (fenêtre de retrait ou validation). */
  async cancel(tenantId: string, id: string): Promise<JarvisAction> {
    const action = await this.get(tenantId, id);
    if (action.status !== "awaiting_approval" && action.status !== "scheduled") {
      throw new BadRequestError(`Action ${action.status}, plus annulable`);
    }
    if (
      action.status === "scheduled" &&
      action.policy === "auto_cancellable" &&
      action.cancellableUntil &&
      action.cancellableUntil.getTime() < Date.now()
    ) {
      throw new BadRequestError("Fenêtre de retrait expirée");
    }
    const row = await this.transition(tenantId, id, {
      status: "cancelled",
      cancelledAt: new Date(),
    });
    this.publish(row, "jarvis.action.cancelled");
    return row;
  }

  /**
   * Annulation système (pas le patron) : l'Executor retire une action dont
   * le tool a été désactivé dans la boutique entre la proposition et
   * l'exécution. Pas de contrôle de fenêtre : le système peut toujours retirer.
   */
  async cancelBySystem(tenantId: string, id: string, reason: string): Promise<JarvisAction> {
    const row = await this.transition(tenantId, id, {
      status: "cancelled",
      cancelledAt: new Date(),
      result: { reason },
    });
    this.publish(row, "jarvis.action.cancelled");
    return row;
  }

  /**
   * Actions prêtes à être exécutées par l'Executor : scheduled ET fenêtre
   * de retrait écoulée (ou absente — policy auto ou action approuvée).
   */
  async listExecutable(tenantId: string, now = new Date()): Promise<JarvisAction[]> {
    return this.db
      .select()
      .from(schema.jarvisActions)
      .where(
        and(
          eq(schema.jarvisActions.tenantId, tenantId),
          eq(schema.jarvisActions.status, "scheduled"),
          or(
            isNull(schema.jarvisActions.cancellableUntil),
            lt(schema.jarvisActions.cancellableUntil, now),
          ),
        ),
      );
  }

  async markExecuted(
    tenantId: string,
    id: string,
    result?: Record<string, unknown>,
  ): Promise<JarvisAction> {
    const row = await this.transition(tenantId, id, {
      status: "executed",
      executedAt: new Date(),
      result: result ?? null,
    });
    this.publish(row, "jarvis.action.executed");
    return row;
  }

  async markFailed(tenantId: string, id: string, error: string): Promise<JarvisAction> {
    const row = await this.transition(tenantId, id, {
      status: "failed",
      result: { error },
    });
    this.publish(row, "jarvis.action.failed");
    return row;
  }

  async list(tenantId: string, status?: JarvisAction["status"]): Promise<JarvisAction[]> {
    const conditions = [eq(schema.jarvisActions.tenantId, tenantId)];
    if (status) conditions.push(eq(schema.jarvisActions.status, status));
    return this.db
      .select()
      .from(schema.jarvisActions)
      .where(and(...conditions))
      .orderBy(schema.jarvisActions.createdAt);
  }

  private async get(tenantId: string, id: string): Promise<JarvisAction> {
    const [row] = await this.db
      .select()
      .from(schema.jarvisActions)
      .where(and(eq(schema.jarvisActions.tenantId, tenantId), eq(schema.jarvisActions.id, id)));
    if (!row) throw new NotFoundError("Action Jarvis introuvable");
    return row;
  }

  private async transition(
    tenantId: string,
    id: string,
    patch: Partial<typeof schema.jarvisActions.$inferInsert>,
  ): Promise<JarvisAction> {
    const [row] = await this.db
      .update(schema.jarvisActions)
      .set(patch)
      .where(and(eq(schema.jarvisActions.tenantId, tenantId), eq(schema.jarvisActions.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Action Jarvis introuvable");
    return row;
  }

  private publish(action: JarvisAction, eventType: string): void {
    this.bus?.publish(
      action.tenantId,
      eventType,
      { id: action.id, type: action.type, summary: action.summary, status: action.status },
      "jarvis",
    );
  }
}
