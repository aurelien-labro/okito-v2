import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { GoogleBusinessService } from "./google-business.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const OAUTH = {
  clientId: "cid",
  clientSecret: "secret",
  redirectUri: "http://localhost:3001/oauth/google-business/callback",
};

describe("GoogleBusinessService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-gbp", name: "Boulangerie du Parc" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function connections() {
    return ctx.db
      .select()
      .from(schema.tenantGoogleBusiness)
      .where(eq(schema.tenantGoogleBusiness.tenantId, tenantId));
  }

  it("buildAuthUrl : scope business.manage + state anti-CSRF", () => {
    const svc = new GoogleBusinessService(ctx.db, OAUTH);
    const { url, state } = svc.buildAuthUrl(tenantId);
    expect(url).toContain("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fbusiness.manage");
    expect(url).toContain(`state=${state}`);
    expect(url).toContain("access_type=offline");
  });

  it("handleCallback : échange le code, découvre compte+fiche, crée la connexion", async () => {
    const fetchImpl = vi
      .fn()
      // 1. exchange code → tokens
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
      )
      // 2. accounts.list
      .mockResolvedValueOnce(jsonResponse({ accounts: [{ name: "accounts/42" }] }))
      // 3. locations.list
      .mockResolvedValueOnce(
        jsonResponse({
          locations: [{ name: "locations/99", title: "Boulangerie du Parc" }],
        }),
      );
    const svc = new GoogleBusinessService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);

    const { state } = svc.buildAuthUrl(tenantId);
    const safe = await svc.handleCallback("code-1", state);

    expect(safe).toMatchObject({
      accountName: "accounts/42",
      locationName: "locations/99",
      locationTitle: "Boulangerie du Parc",
      status: "active",
    });
    // Les tokens ne sortent pas
    expect(safe).not.toHaveProperty("accessToken");
    expect(safe).not.toHaveProperty("refreshToken");

    const [row] = await connections();
    expect(row?.accessToken).toBe("at");
    expect(row?.refreshToken).toBe("rt");
  });

  it("handleCallback : state inconnu → erreur", async () => {
    const svc = new GoogleBusinessService(ctx.db, OAUTH);
    await expect(svc.handleCallback("code", "state-bidon")).rejects.toThrow(/state/i);
  });

  it("handleCallback : sans refresh_token → erreur explicite", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "at", expires_in: 3600 }));
    const svc = new GoogleBusinessService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);
    const { state } = svc.buildAuthUrl(tenantId);
    await expect(svc.handleCallback("code", state)).rejects.toThrow(/refresh/i);
  });

  it("listReviews : parse starRating enum → note, détecte les réponses existantes", async () => {
    const [conn] = await ctx.db
      .insert(schema.tenantGoogleBusiness)
      .values({
        tenantId,
        accountName: "accounts/1",
        locationName: "locations/1",
        locationTitle: "Fiche",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      })
      .returning();
    if (!conn) throw new Error("insert failed");

    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        reviews: [
          {
            name: "accounts/1/locations/1/reviews/A",
            starRating: "TWO",
            comment: "Bof",
            reviewer: { displayName: "Jean" },
            updateTime: "2026-07-01T10:00:00Z",
          },
          {
            name: "accounts/1/locations/1/reviews/B",
            starRating: "FIVE",
            reviewer: { displayName: "Marie" },
            reviewReply: { comment: "Merci !" },
            updateTime: "2026-07-02T10:00:00Z",
          },
          // starRating manquant → ignoré
          { name: "accounts/1/locations/1/reviews/C", updateTime: "2026-07-03T10:00:00Z" },
        ],
      }),
    );
    const svc = new GoogleBusinessService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);

    const reviews = await svc.listReviews(conn.id);
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatchObject({ rating: 2, comment: "Bof", hasReply: false });
    expect(reviews[1]).toMatchObject({ rating: 5, hasReply: true });
  });

  it("replyToReview : PUT sur l'endpoint reply", async () => {
    const [conn] = await ctx.db
      .insert(schema.tenantGoogleBusiness)
      .values({
        tenantId,
        accountName: "accounts/1",
        locationName: "locations/1",
        locationTitle: "Fiche",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      })
      .returning();
    if (!conn) throw new Error("insert failed");

    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    const svc = new GoogleBusinessService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);

    await svc.replyToReview(
      conn.id,
      "accounts/1/locations/1/reviews/A",
      "Merci pour votre retour.",
    );
    const [calledUrl, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/reviews/A/reply");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ comment: "Merci pour votre retour." });
  });

  it("getFreshAccessToken : renouvelle quand l'access est expiré", async () => {
    const [conn] = await ctx.db
      .insert(schema.tenantGoogleBusiness)
      .values({
        tenantId,
        accountName: "accounts/1",
        locationName: "locations/1",
        locationTitle: "Fiche",
        accessToken: "vieux",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() - 1000),
      })
      .returning();
    if (!conn) throw new Error("insert failed");

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "neuf", expires_in: 3600 }));
    const svc = new GoogleBusinessService(ctx.db, OAUTH, fetchImpl as unknown as typeof fetch);

    const token = await svc.getFreshAccessToken(conn.id);
    expect(token).toBe("neuf");
    const [row] = await connections();
    expect(row?.accessToken).toBe("neuf");
  });

  it("list/setStatus/remove : cycle de gestion sans exposer les tokens", async () => {
    const svc = new GoogleBusinessService(ctx.db, OAUTH);
    const [conn] = await ctx.db
      .insert(schema.tenantGoogleBusiness)
      .values({
        tenantId,
        accountName: "accounts/1",
        locationName: "locations/1",
        locationTitle: "Fiche",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      })
      .returning();
    if (!conn) throw new Error("insert failed");

    const listed = await svc.list(tenantId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("accessToken");

    const paused = await svc.setStatus(tenantId, conn.id, "paused");
    expect(paused.status).toBe("paused");

    await svc.remove(tenantId, conn.id);
    expect(await connections()).toHaveLength(0);
  });
});
