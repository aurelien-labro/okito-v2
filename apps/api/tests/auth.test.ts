import { Hono } from "hono";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/lib/env.js";
import { loadEnv } from "../src/lib/env.js";
import { HttpError } from "../src/lib/errors.js";
import type { AppEnv } from "../src/lib/types.js";
import { createAuthMiddleware } from "../src/middleware/auth.js";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const SECRET = "test-secret-must-be-at-least-16-chars-long";

function makeApp(envOverrides: Partial<NodeJS.ProcessEnv>) {
  const env: Env = loadEnv({
    NODE_ENV: "test",
    PORT: "3001",
    APP_URL: "http://localhost:3000",
    LLM_MODEL: "gemini-2.5-flash",
    LLM_FALLBACK_MODEL: "gemini-2.5-pro",
    LLM_TIMEOUT_MS: "1000",
    LLM_RETRY_MAX: "1",
    ...envOverrides,
  } as NodeJS.ProcessEnv);

  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 401);
    }
    return c.json({ error: { code: "server", message: "boom" } }, 500);
  });
  app.use("*", createAuthMiddleware(env));
  app.get("/me", (c) => c.json({ tenantId: c.get("tenantId"), userId: c.get("userId") ?? null }));
  return app;
}

describe("authMiddleware — dev bypass", () => {
  let app: ReturnType<typeof makeApp>;
  beforeEach(() => {
    app = makeApp({});
  });

  it("X-Tenant-Id valide → 200 + tenantId posé", async () => {
    const res = await app.request("/me", { headers: { "X-Tenant-Id": TENANT_A } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantId: string };
    expect(body.tenantId).toBe(TENANT_A);
  });

  it("X-Tenant-Id malformé → 401", async () => {
    const res = await app.request("/me", { headers: { "X-Tenant-Id": "pas-un-uuid" } });
    expect(res.status).toBe(401);
  });

  it("pas de header → 401", async () => {
    const res = await app.request("/me");
    expect(res.status).toBe(401);
  });

  it("bypass refusé en production", async () => {
    const prodApp = makeApp({ NODE_ENV: "production" });
    const res = await prodApp.request("/me", { headers: { "X-Tenant-Id": TENANT_A } });
    expect(res.status).toBe(401);
  });
});

describe("authMiddleware — JWT", () => {
  it("Bearer JWT signé valide → 200 + tenantId extrait", async () => {
    const app = makeApp({ SUPABASE_JWT_SECRET: SECRET });
    const token = await new SignJWT({ tenant_id: TENANT_A, sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));

    const res = await app.request("/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantId: string; userId: string };
    expect(body.tenantId).toBe(TENANT_A);
    expect(body.userId).toBe("user-1");
  });

  it("Bearer JWT signé avec mauvais secret → 401", async () => {
    const app = makeApp({ SUPABASE_JWT_SECRET: SECRET });
    const token = await new SignJWT({ tenant_id: TENANT_A })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("mauvais-secret-mauvais-secret-1"));
    const res = await app.request("/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it("Bearer JWT sans claim tenant_id → 401", async () => {
    const app = makeApp({ SUPABASE_JWT_SECRET: SECRET });
    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(SECRET));
    const res = await app.request("/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it("JWT non signé accepté en dev (sans secret configuré)", async () => {
    const app = makeApp({});
    const fakePayload = Buffer.from(JSON.stringify({ tenant_id: TENANT_A })).toString("base64url");
    const fakeToken = `eyJhbGciOiJIUzI1NiJ9.${fakePayload}.fake-signature`;
    const res = await app.request("/me", { headers: { Authorization: `Bearer ${fakeToken}` } });
    expect(res.status).toBe(200);
  });
});
