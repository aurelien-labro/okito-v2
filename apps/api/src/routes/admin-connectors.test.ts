import { describe, expect, it, vi } from "vitest";
import { BadRequestError } from "../lib/errors.js";
import type {
  ConnectorMarketplaceService,
  ConnectorStatus,
} from "../services/connector-marketplace.js";
import { adminConnectorsRoute } from "./admin-connectors.js";

/**
 * Contrat HTTP de la marketplace de connecteurs — montée sans middleware auth
 * (testé à part) pour vérifier le câblage, la validation et les codes d'erreur.
 */

const TENANT = "2853f3bc-cc57-46c1-959e-a07354feb505";

const STATUS: ConnectorStatus = {
  connectorId: "meteo-alerts",
  name: "Alertes météo",
  description: "Prévient les clients en cas d'alerte météo.",
  publisher: "acme-tools",
  version: "1.0.0",
  endpoint: "https://connector.example/hook",
  enabled: true,
  actionType: "ext.meteo-alerts",
  installedAt: new Date("2026-07-18T10:00:00Z"),
};

function makeApp() {
  const service = {
    list: vi.fn(async () => [STATUS]),
    install: vi.fn(async () => STATUS),
    setEnabled: vi.fn(async () => ({ ...STATUS, enabled: false })),
    uninstall: vi.fn(async () => undefined),
  } as unknown as ConnectorMarketplaceService;
  return { app: adminConnectorsRoute(service), service };
}

describe("adminConnectorsRoute", () => {
  it("GET /:tenantId liste les connecteurs installés", async () => {
    const { app, service } = makeApp();
    const res = await app.request(`/${TENANT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ConnectorStatus[] };
    expect(body.data[0]?.connectorId).toBe("meteo-alerts");
    expect(service.list).toHaveBeenCalledWith(TENANT);
  });

  it("POST /:tenantId installe un manifest signé → 201", async () => {
    const { app, service } = makeApp();
    const res = await app.request(`/${TENANT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifest: '{"id":"meteo-alerts"}', signature: "c2ln" }),
    });
    expect(res.status).toBe(201);
    expect(service.install).toHaveBeenCalledWith(TENANT, '{"id":"meteo-alerts"}', "c2ln");
  });

  it("POST sans signature → 400 validation_error", async () => {
    const { app } = makeApp();
    const res = await app.request(`/${TENANT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifest: "{}" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("POST avec manifest refusé par le service → 400 avec son code", async () => {
    const { app, service } = makeApp();
    vi.mocked(service.install).mockRejectedValueOnce(
      new BadRequestError("Signature du manifest invalide", "invalid_signature"),
    );
    const res = await app.request(`/${TENANT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifest: "{}", signature: "bad" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_signature");
  });

  it("PATCH /:tenantId/:connectorId coupe le connecteur", async () => {
    const { app, service } = makeApp();
    const res = await app.request(`/${TENANT}/meteo-alerts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { enabled: boolean } };
    expect(body.data.enabled).toBe(false);
    expect(service.setEnabled).toHaveBeenCalledWith(TENANT, "meteo-alerts", false);
  });

  it("DELETE /:tenantId/:connectorId désinstalle", async () => {
    const { app, service } = makeApp();
    const res = await app.request(`/${TENANT}/meteo-alerts`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(service.uninstall).toHaveBeenCalledWith(TENANT, "meteo-alerts");
  });

  it("tenantId non-UUID → 400", async () => {
    const { app } = makeApp();
    const res = await app.request("/pas-un-uuid");
    expect(res.status).toBe(400);
  });
});
