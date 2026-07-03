import { type Database, type WebhookEvent, schema } from "@okito/db";
import { logger } from "../lib/logger.js";
import type { WebhookDispatchService } from "./webhook-dispatch.js";

/**
 * Contrat minimal d'émission d'événements métier, satisfait à la fois par
 * EventBusService et WebhookDispatchService. Les services métier dépendent
 * de cette interface, pas d'une implémentation.
 */
export interface BusinessEventEmitter {
  emit(tenantId: string, event: WebhookEvent, payload: Record<string, unknown>): void;
}

/**
 * Bus d'événements central (fondation V3).
 *
 * Toute émission est journalisée dans la table append-only `events`, puis
 * relayée aux webhooks sortants du tenant. Fire-and-forget : ne bloque et
 * ne fait jamais échouer le flux appelant — un event bus en panne ne doit
 * pas empêcher une résa d'être créée.
 */
export class EventBusService implements BusinessEventEmitter {
  constructor(
    private readonly db: Database,
    private readonly webhooks?: WebhookDispatchService,
  ) {}

  /** Événement métier standard : journalisé + relayé aux webhooks abonnés. */
  emit(tenantId: string, event: WebhookEvent, payload: Record<string, unknown>): void {
    this.publish(tenantId, event, payload);
    this.webhooks?.emit(tenantId, event, payload);
  }

  /**
   * Journalise un événement de type libre (non limité aux WebhookEvent),
   * sans relais webhook. Pour les événements internes (Jarvis, connecteurs).
   */
  publish(tenantId: string, type: string, payload: Record<string, unknown>, source = "api"): void {
    void this.db
      .insert(schema.events)
      .values({ tenantId, type, payload, source })
      .catch((err) => logger.error({ err, tenantId, type }, "event bus persist failed"));
  }
}
