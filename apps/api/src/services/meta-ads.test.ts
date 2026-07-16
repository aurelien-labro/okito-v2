import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { MetaAdsService } from "./meta-ads.js";

const OAUTH = {
  appId: "meta-app-id",
  appSecret: "meta-app-secret",
  redirectUri: "http://localhost:3001/oauth/meta/callback",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MetaAdsService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-meta", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await ctx.cleanup();
  });

  it("buildAuthUrl : scope ads_read et state anti-CSRF", () => {
    const svc = new MetaAdsService(ctx.db, OAUTH);
    const { url, state } = svc.buildAuthUrl(tenantId);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://www.facebook.com/v19.0/dialog/oauth");
    expect(parsed.searchParams.get("scope")).toBe("ads_read");
    expect(parsed.searchParams.get("state")).toBe(state);
  });

  it("handleCallback : échange le token, identifie le compte et ne l'expose jamais", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "short-token" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "long-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ id: "meta-user-1", name: "OKITO Commerce" }));
    const svc = new MetaAdsService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);
    const { state } = svc.buildAuthUrl(tenantId);

    const safe = await svc.handleCallback("code-123", state);

    expect(safe).toMatchObject({
      externalAccountId: "meta-user-1",
      accountLabel: "OKITO Commerce",
      status: "active",
    });
    expect(safe).not.toHaveProperty("accessToken");

    const [row] = await ctx.db.select().from(schema.tenantMetaConnections);
    expect(row?.accessToken).toBe("long-token");
  });

  it("handleCallback : state inconnu ou réutilisé est rejeté", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "short" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "long" }))
      .mockResolvedValueOnce(jsonResponse({ id: "meta-user-1", name: "OKITO" }));
    const svc = new MetaAdsService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);
    await expect(svc.handleCallback("code", "state-inconnu")).rejects.toThrow(/state/i);

    const { state } = svc.buildAuthUrl(tenantId);
    await svc.handleCallback("code", state);
    await expect(svc.handleCallback("code", state)).rejects.toThrow(/state/i);
  });

  it("list/setStatus/remove : cycle tenant-scopé sans exposer le token", async () => {
    const svc = new MetaAdsService(ctx.db, OAUTH);
    const [row] = await ctx.db
      .insert(schema.tenantMetaConnections)
      .values({
        tenantId,
        externalAccountId: "act_123",
        accountLabel: "Meta Ads",
        accessToken: "secret",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      })
      .returning();
    if (!row) throw new Error("insert failed");

    const listed = await svc.list(tenantId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("accessToken");

    const paused = await svc.setStatus(tenantId, row.id, "paused");
    expect(paused.status).toBe("paused");
    await svc.remove(tenantId, row.id);
    expect(await svc.list(tenantId)).toHaveLength(0);
  });
});
