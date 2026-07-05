import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { BadRequestError } from "../lib/errors.js";
import { MicrosoftMailboxService, type MicrosoftOAuthConfig } from "./microsoft-mailbox.js";

const OAUTH: MicrosoftOAuthConfig = {
  clientId: "ms-client-id",
  clientSecret: "ms-client-secret",
  redirectUri: "http://localhost:3001/oauth/microsoft/callback",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MicrosoftMailboxService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-ms", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("buildAuthUrl : URL Microsoft avec scope Mail.Read, offline_access et state", () => {
    const svc = new MicrosoftMailboxService(ctx.db, OAUTH);
    const { url, state } = svc.buildAuthUrl(tenantId);

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    expect(parsed.searchParams.get("scope")).toContain("Mail.Read");
    expect(parsed.searchParams.get("scope")).toContain("offline_access");
    expect(parsed.searchParams.get("state")).toBe(state);
  });

  it("handleCallback : échange le code, résout l'adresse, stocke la boîte outlook", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ mail: "patron@boulangerie.fr" }));
    const svc = new MicrosoftMailboxService(ctx.db, OAUTH, fetchMock as unknown as typeof fetch);

    const { state } = svc.buildAuthUrl(tenantId);
    const mailbox = await svc.handleCallback("auth-code", state);

    expect(mailbox).toMatchObject({
      tenantId,
      provider: "outlook",
      emailAddress: "patron@boulangerie.fr",
      status: "active",
    });
    expect("accessToken" in mailbox).toBe(false);
  });

  it("handleCallback : userPrincipalName en repli si mail absent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ userPrincipalName: "patron@tenant.onmicrosoft.com" }));
    const svc = new MicrosoftMailboxService(ctx.db, OAUTH, fetchMock as unknown as typeof fetch);
    const { state } = svc.buildAuthUrl(tenantId);

    const mailbox = await svc.handleCallback("code", state);
    expect(mailbox.emailAddress).toBe("patron@tenant.onmicrosoft.com");
  });

  it("handleCallback : state inconnu refusé (anti-CSRF)", async () => {
    const svc = new MicrosoftMailboxService(ctx.db, OAUTH, vi.fn() as unknown as typeof fetch);
    await expect(svc.handleCallback("code", "bidon")).rejects.toThrow(BadRequestError);
  });

  it("getFreshAccessToken : renouvelle et garde le refresh token tournant", async () => {
    const [box] = await ctx.db
      .insert(schema.tenantMailboxes)
      .values({
        tenantId,
        provider: "outlook",
        emailAddress: "patron@boulangerie.fr",
        accessToken: "at-vieux",
        refreshToken: "rt-vieux",
        accessTokenExpiresAt: new Date(Date.now() - 1000),
      })
      .returning();
    if (!box) throw new Error("mailbox insert failed");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "at-neuf", refresh_token: "rt-neuf", expires_in: 3600 }),
      );
    const svc = new MicrosoftMailboxService(ctx.db, OAUTH, fetchMock as unknown as typeof fetch);

    expect(await svc.getFreshAccessToken(box.id)).toBe("at-neuf");
    const updated = await ctx.db.query.tenantMailboxes.findFirst({
      where: (m, { eq }) => eq(m.id, box.id),
    });
    expect(updated?.refreshToken).toBe("rt-neuf");
  });
});
