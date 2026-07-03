import { createHmac } from "node:crypto";
import { type Database, type TenantWebhook, type WebhookEvent, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { isSafePublicUrl } from "../lib/ssrf.js";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 300;
const TIMEOUT_MS = 5000;

/**
 * Diffuse les événements métier aux webhooks sortants d'un tenant.
 *
 * Fire-and-forget : ne bloque jamais le flux appelant (création de résa, etc.).
 * Chaque endpoint reçoit un POST JSON signé HMAC-SHA256 (header
 * X-Okito-Signature) et bénéficie d'un retry exponentiel (3 tentatives).
 */
export class WebhookDispatchService {
  constructor(
    private readonly db: Database,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Émet un événement en arrière-plan. Ne rejette jamais. */
  emit(tenantId: string, event: WebhookEvent, payload: Record<string, unknown>): void {
    void this.dispatch(tenantId, event, payload).catch((err) =>
      logger.error({ err, tenantId, event }, "webhook dispatch failed"),
    );
  }

  private async dispatch(
    tenantId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const hooks = await this.db
      .select()
      .from(schema.tenantWebhooks)
      .where(
        and(eq(schema.tenantWebhooks.tenantId, tenantId), eq(schema.tenantWebhooks.active, true)),
      );

    const subscribed = hooks.filter((h) => h.events.length === 0 || h.events.includes(event));
    if (subscribed.length === 0) return;

    const body = JSON.stringify({ event, tenantId, data: payload, at: new Date().toISOString() });
    await Promise.all(subscribed.map((hook) => this.deliver(hook, event, body)));
  }

  private async deliver(hook: TenantWebhook, event: WebhookEvent, body: string): Promise<void> {
    // Défense en profondeur : re-vérifie l'URL au moment de l'envoi (une URL a
    // pu être insérée hors du service CRUD, ou la garde a évolué).
    if (!isSafePublicUrl(hook.url)) {
      logger.warn({ webhookId: hook.id }, "webhook URL non-publique — envoi bloqué");
      return;
    }
    const signature = createHmac("sha256", hook.secret).update(body).digest("hex");

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const res = await this.fetchImpl(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Okito-Event": event,
            "X-Okito-Signature": `sha256=${signature}`,
          },
          body,
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) return;
        // 4xx (hors 429) : la requête est mauvaise, inutile de retenter.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          logger.warn({ webhookId: hook.id, status: res.status }, "webhook 4xx, abandon");
          return;
        }
      } catch (err) {
        logger.warn({ err, webhookId: hook.id, attempt }, "webhook attempt failed");
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
    logger.error({ webhookId: hook.id, url: hook.url }, "webhook delivery exhausted retries");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
