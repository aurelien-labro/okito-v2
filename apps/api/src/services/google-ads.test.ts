import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { GoogleAdsService } from "./google-ads.js";

const OAUTH = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:3001/oauth/google-ads/callback",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GoogleAdsService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-gads", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  it("buildAuthUrl : scope adwords, offline, state anti-CSRF", () => {
    const svc = new GoogleAdsService(ctx.db, OAUTH);
    const { url, state } = svc.buildAuthUrl(tenantId);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/adwords");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("state")).toBe(state);
  });

  it("handleCallback : échange le code, stocke la connexion, tokens jamais exposés", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }),
      );
    const svc = new GoogleAdsService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);
    const { state } = svc.buildAuthUrl(tenantId);

    const safe = await svc.handleCallback("code-123", state);

    expect(safe).not.toHaveProperty("accessToken");
    expect(safe).not.toHaveProperty("refreshToken");
    expect(safe.accountLabel).toBe("Google Ads");
    expect(safe.status).toBe("active");

    const [row] = await ctx.db.select().from(schema.tenantGoogleAdsConnections);
    expect(row?.accessToken).toBe("at-1");
    expect(row?.refreshToken).toBe("rt-1");
  });

  it("handleCallback : state inconnu ou réutilisé → rejet", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
      );
    const svc = new GoogleAdsService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);
    await expect(svc.handleCallback("code", "state-inconnu")).rejects.toThrow(/state/i);

    const { state } = svc.buildAuthUrl(tenantId);
    await svc.handleCallback("code", state);
    await expect(svc.handleCallback("code", state)).rejects.toThrow(/state/i);
  });

  it("list/setStatus/remove : cycle sans exposer les tokens", async () => {
    const svc = new GoogleAdsService(ctx.db, OAUTH);
    const [row] = await ctx.db
      .insert(schema.tenantGoogleAdsConnections)
      .values({
        tenantId,
        accessToken: "at",
        refreshToken: "rt",
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
