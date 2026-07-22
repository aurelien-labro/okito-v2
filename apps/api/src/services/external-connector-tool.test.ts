import { createHmac } from "node:crypto";
import type { JarvisAction, TenantConnector } from "@okito/db";
import { describe, expect, it, vi } from "vitest";
import type { ConnectorMarketplaceService } from "./connector-marketplace.js";
import { ExternalConnectorTool } from "./external-connector-tool.js";

/**
 * Exécution d'un connecteur tiers : POST signé HMAC-SHA256 sur son endpoint,
 * refus si non installé ou désactivé, erreur HTTP propagée en échec d'action.
 */

const TENANT = "2853f3bc-cc57-46c1-959e-a07354feb505";
const SECRET = "a".repeat(64);

function makeAction(type = "ext.meteo-alerts"): JarvisAction {
  return {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    tenantId: TENANT,
    type,
    summary: "Prévenir le client de l'alerte orage",
    policy: "approval",
    status: "scheduled",
    payload: { reservationId: "r1" },
    result: null,
    cancellableUntil: null,
    createdAt: new Date(),
    executedAt: null,
    cancelledAt: null,
  } as JarvisAction;
}

function makeConnector(overrides: Partial<TenantConnector> = {}): TenantConnector {
  return {
    id: "c0ffee00-0000-4000-8000-000000000000",
    tenantId: TENANT,
    connectorId: "meteo-alerts",
    name: "Alertes météo",
    publisher: "acme-tools",
    version: "1.0.0",
    endpoint: "https://connector.example/hook",
    manifest: {},
    sharedSecret: SECRET,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TenantConnector;
}

function makeMarketplace(connector: TenantConnector | undefined) {
  return { get: vi.fn(async () => connector) } as unknown as ConnectorMarketplaceService;
}

describe("ExternalConnectorTool", () => {
  it("matches ne prend que les types ext.*", () => {
    const tool = new ExternalConnectorTool(makeMarketplace(undefined));
    expect(tool.matches("ext.meteo-alerts")).toBe(true);
    expect(tool.matches("review.reply")).toBe(false);
  });

  it("POSTe le payload signé HMAC sur l'endpoint et renvoie la réponse", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ delivered: true }), { status: 200 }),
    );
    const tool = new ExternalConnectorTool(makeMarketplace(makeConnector()), fetchMock);

    const result = await tool.execute(makeAction());
    expect(result).toEqual({ delivered: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://connector.example/hook");
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    const expected = createHmac("sha256", SECRET)
      .update(`${headers["X-Okito-Timestamp"]}.${body}`)
      .digest("hex");
    expect(headers["X-Okito-Signature"]).toBe(expected);
    const parsed = JSON.parse(body) as { type: string; payload: { reservationId: string } };
    expect(parsed.type).toBe("ext.meteo-alerts");
    expect(parsed.payload.reservationId).toBe("r1");
  });

  it("connecteur non installé ou désactivé → erreur explicite, aucun appel réseau", async () => {
    const fetchMock = vi.fn();
    const missing = new ExternalConnectorTool(makeMarketplace(undefined), fetchMock);
    await expect(missing.execute(makeAction())).rejects.toThrow(/non installé/);

    const disabled = new ExternalConnectorTool(
      makeMarketplace(makeConnector({ enabled: false })),
      fetchMock,
    );
    await expect(disabled.execute(makeAction())).rejects.toThrow(/désactivé/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("réponse HTTP non-2xx → erreur avec le statut", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 502 }));
    const tool = new ExternalConnectorTool(makeMarketplace(makeConnector()), fetchMock);
    await expect(tool.execute(makeAction())).rejects.toThrow(/HTTP 502/);
  });

  it("réponse non-JSON → résultat vide (l'action reste executed)", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const tool = new ExternalConnectorTool(makeMarketplace(makeConnector()), fetchMock);
    expect(await tool.execute(makeAction())).toEqual({});
  });
});
