import { generateKeyPairSync, sign } from "node:crypto";
import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { createTestDb } from "../../tests/_helpers/pg.js";
import { createTestDb as makeDb } from "../../tests/_helpers/pg.js";
import {
  ConnectorMarketplaceService,
  externalActionType,
  parseTrustedPublishers,
} from "./connector-marketplace.js";

/**
 * Marketplace de connecteurs tiers : signature Ed25519 vérifiée contre le
 * registre des éditeurs, endpoint HTTPS public obligatoire, cycle de vie
 * install / list / toggle / uninstall.
 */

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLISHER = "acme-tools";
const TRUSTED = {
  [PUBLISHER]: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
};

function makeManifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "meteo-alerts",
    name: "Alertes météo",
    description: "Prévient les clients en cas d'alerte météo sur leur réservation.",
    version: "1.0.0",
    publisher: PUBLISHER,
    endpoint: "https://connector.acme-tools.example/hook",
    ...overrides,
  });
}

function signManifest(manifestJson: string): string {
  return sign(null, Buffer.from(manifestJson, "utf8"), privateKey).toString("base64");
}

describe("ConnectorMarketplaceService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let service: ConnectorMarketplaceService;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await makeDb();
    service = new ConnectorMarketplaceService(ctx.db, TRUSTED);
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto", name: "Resto Test" })
      .returning();
    if (!tenant) throw new Error("insert tenant failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("installe un manifest correctement signé et masque le secret", async () => {
    const manifest = makeManifest();
    const status = await service.install(tenantId, manifest, signManifest(manifest));
    expect(status.connectorId).toBe("meteo-alerts");
    expect(status.publisher).toBe(PUBLISHER);
    expect(status.enabled).toBe(true);
    expect(status.actionType).toBe(externalActionType("meteo-alerts"));
    expect("sharedSecret" in status).toBe(false);

    const row = await service.get(tenantId, "meteo-alerts");
    expect(row?.sharedSecret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejette un éditeur hors registre", async () => {
    const manifest = makeManifest({ publisher: "inconnu" });
    await expect(service.install(tenantId, manifest, signManifest(manifest))).rejects.toThrow(
      /Éditeur non reconnu/,
    );
  });

  it("rejette une signature invalide (manifest altéré après signature)", async () => {
    const signature = signManifest(makeManifest());
    const altered = makeManifest({ endpoint: "https://evil.example/hook" });
    await expect(service.install(tenantId, altered, signature)).rejects.toThrow(
      /Signature du manifest invalide/,
    );
  });

  it("rejette un endpoint http ou interne, même bien signé", async () => {
    for (const endpoint of ["http://connector.example/hook", "https://192.168.1.10/hook"]) {
      const manifest = makeManifest({ endpoint });
      await expect(service.install(tenantId, manifest, signManifest(manifest))).rejects.toThrow(
        /Endpoint du connecteur invalide/,
      );
    }
  });

  it("réinstallation : met à jour le manifest en conservant le secret", async () => {
    const v1 = makeManifest();
    await service.install(tenantId, v1, signManifest(v1));
    const secretBefore = (await service.get(tenantId, "meteo-alerts"))?.sharedSecret;

    const v2 = makeManifest({ version: "1.1.0" });
    const status = await service.install(tenantId, v2, signManifest(v2));
    expect(status.version).toBe("1.1.0");
    expect((await service.get(tenantId, "meteo-alerts"))?.sharedSecret).toBe(secretBefore);
    expect(await service.list(tenantId)).toHaveLength(1);
  });

  it("toggle + uninstall", async () => {
    const manifest = makeManifest();
    await service.install(tenantId, manifest, signManifest(manifest));

    const off = await service.setEnabled(tenantId, "meteo-alerts", false);
    expect(off.enabled).toBe(false);

    await service.uninstall(tenantId, "meteo-alerts");
    expect(await service.list(tenantId)).toHaveLength(0);
    await expect(service.uninstall(tenantId, "meteo-alerts")).rejects.toThrow(/introuvable/);
  });

  it("parseTrustedPublishers : vide → {}, JSON invalide → erreur explicite", () => {
    expect(parseTrustedPublishers(undefined)).toEqual({});
    expect(parseTrustedPublishers(JSON.stringify(TRUSTED))).toEqual(TRUSTED);
    expect(() => parseTrustedPublishers("pas du json")).toThrow(
      /MARKETPLACE_TRUSTED_PUBLISHERS invalide/,
    );
  });
});
