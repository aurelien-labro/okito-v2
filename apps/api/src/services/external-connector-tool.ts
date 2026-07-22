import { createHmac } from "node:crypto";
import type { JarvisAction } from "@okito/db";
import {
  type ConnectorMarketplaceService,
  EXTERNAL_ACTION_PREFIX,
} from "./connector-marketplace.js";
import type { JarvisTool } from "./jarvis-executor.js";

/**
 * Tool Jarvis générique pour les connecteurs tiers (types `ext.<connectorId>`).
 *
 * Exécution = POST JSON sur l'endpoint du connecteur, signé HMAC-SHA256 avec
 * le secret partagé du tenant : `X-Okito-Signature = hex(hmac(secret,
 * "<timestamp>.<body>"))` + `X-Okito-Timestamp`. Le connecteur recalcule et
 * rejette au-delà de quelques minutes de dérive (anti-rejeu côté éditeur).
 */
export class ExternalConnectorTool implements JarvisTool {
  readonly type = EXTERNAL_ACTION_PREFIX; // informatif — routé via matches()

  constructor(
    private readonly marketplace: ConnectorMarketplaceService,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  matches(type: string): boolean {
    return type.startsWith(EXTERNAL_ACTION_PREFIX);
  }

  async execute(action: JarvisAction): Promise<Record<string, unknown>> {
    const connectorId = action.type.slice(EXTERNAL_ACTION_PREFIX.length);
    const connector = await this.marketplace.get(action.tenantId, connectorId);
    if (!connector) throw new Error(`connecteur non installé : ${connectorId}`);
    if (!connector.enabled) throw new Error(`connecteur désactivé : ${connectorId}`);

    const body = JSON.stringify({
      actionId: action.id,
      type: action.type,
      summary: action.summary,
      payload: action.payload,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", connector.sharedSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    const response = await this.fetchImpl(connector.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Okito-Timestamp": timestamp,
        "X-Okito-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`connecteur ${connectorId} : HTTP ${response.status}`);
    }
    const result = await response.json().catch(() => null);
    return result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : {};
  }
}
