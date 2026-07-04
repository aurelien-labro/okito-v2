import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { BadRequestError } from "../lib/errors.js";
import { type GoogleOAuthConfig, MailboxService } from "./mailbox.js";

const OAUTH: GoogleOAuthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:3001/oauth/google/callback",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MailboxService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-mail", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("buildAuthUrl : URL Google avec scope gmail.readonly, offline et state", () => {
    const svc = new MailboxService(ctx.db, OAUTH);
    const { url, state } = svc.buildAuthUrl(tenantId);

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("scope")).toContain("gmail.readonly");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("state")).toBe(state);
  });

  it("handleCallback : échange le code, résout l'adresse, stocke la boîte", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ email: "contact@chezmarcel.fr" }));
    const svc = new MailboxService(ctx.db, OAUTH, fetchMock as unknown as typeof fetch);

    const { state } = svc.buildAuthUrl(tenantId);
    const mailbox = await svc.handleCallback("auth-code", state);

    expect(mailbox).toMatchObject({
      tenantId,
      provider: "gmail",
      emailAddress: "contact@chezmarcel.fr",
      status: "active",
    });
    expect("accessToken" in mailbox).toBe(false);
    expect("refreshToken" in mailbox).toBe(false);

    const [row] = await ctx.db.select().from(schema.tenantMailboxes);
    expect(row).toMatchObject({ accessToken: "at-1", refreshToken: "rt-1" });
  });

  it("handleCallback : state inconnu refusé (anti-CSRF)", async () => {
    const svc = new MailboxService(ctx.db, OAUTH, vi.fn() as unknown as typeof fetch);
    await expect(svc.handleCallback("code", "state-bidon")).rejects.toThrow(BadRequestError);
  });

  it("handleCallback : refuse si Google n'envoie pas de refresh token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "at-1", expires_in: 3600 }));
    const svc = new MailboxService(ctx.db, OAUTH, fetchMock as unknown as typeof fetch);
    const { state } = svc.buildAuthUrl(tenantId);

    await expect(svc.handleCallback("code", state)).rejects.toThrow(/refresh token/);
    expect(await ctx.db.select().from(schema.tenantMailboxes)).toHaveLength(0);
  });

  it("getFreshAccessToken : renouvelle via refresh quand expiré", async () => {
    const [box] = await ctx.db
      .insert(schema.tenantMailboxes)
      .values({
        tenantId,
        emailAddress: "contact@chezmarcel.fr",
        accessToken: "at-vieux",
        refreshToken: "rt-1",
        accessTokenExpiresAt: new Date(Date.now() - 1000),
      })
      .returning();
    if (!box) throw new Error("mailbox insert failed");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "at-neuf", expires_in: 3600 }));
    const svc = new MailboxService(ctx.db, OAUTH, fetchMock as unknown as typeof fetch);

    const token = await svc.getFreshAccessToken(box.id);

    expect(token).toBe("at-neuf");
    const updated = await ctx.db.query.tenantMailboxes.findFirst({
      where: (m, { eq }) => eq(m.id, box.id),
    });
    expect(updated?.accessToken).toBe("at-neuf");
    expect(updated?.accessTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("getFreshAccessToken : token encore valide → pas d'appel réseau", async () => {
    const [box] = await ctx.db
      .insert(schema.tenantMailboxes)
      .values({
        tenantId,
        emailAddress: "contact@chezmarcel.fr",
        accessToken: "at-valide",
        refreshToken: "rt-1",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      })
      .returning();
    if (!box) throw new Error("mailbox insert failed");
    const fetchMock = vi.fn();
    const svc = new MailboxService(ctx.db, OAUTH, fetchMock as unknown as typeof fetch);

    expect(await svc.getFreshAccessToken(box.id)).toBe("at-valide");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refresh refusé par Google : boîte marquée error avec message", async () => {
    const [box] = await ctx.db
      .insert(schema.tenantMailboxes)
      .values({
        tenantId,
        emailAddress: "contact@chezmarcel.fr",
        accessToken: "at",
        refreshToken: "rt-révoqué",
        accessTokenExpiresAt: new Date(Date.now() - 1000),
      })
      .returning();
    if (!box) throw new Error("mailbox insert failed");
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 400 }));
    const svc = new MailboxService(ctx.db, OAUTH, fetchMock as unknown as typeof fetch);

    await expect(svc.getFreshAccessToken(box.id)).rejects.toThrow(BadRequestError);
    const updated = await ctx.db.query.tenantMailboxes.findFirst({
      where: (m, { eq }) => eq(m.id, box.id),
    });
    expect(updated?.status).toBe("error");
    expect(updated?.lastError).toContain("refresh token refusé");
  });

  it("list : isolation tenant + jamais de tokens", async () => {
    await ctx.db.insert(schema.tenantMailboxes).values({
      tenantId,
      emailAddress: "a@a.fr",
      accessToken: "at",
      refreshToken: "rt",
      accessTokenExpiresAt: new Date(),
    });
    const [other] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "autre-mail", name: "Autre" })
      .returning();
    if (!other) throw new Error("tenant insert failed");

    const svc = new MailboxService(ctx.db, OAUTH);
    const mine = await svc.list(tenantId);
    expect(mine).toHaveLength(1);
    expect("accessToken" in (mine[0] as object)).toBe(false);
    expect(await svc.list(other.id)).toHaveLength(0);
  });
});
