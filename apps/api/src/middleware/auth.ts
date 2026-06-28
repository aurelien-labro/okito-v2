import { createMiddleware } from "hono/factory";
import { type JWTPayload, createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type { Env } from "../lib/env.js";
import { HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";

class UnauthorizedError extends HttpError {
  constructor(message = "Authentification requise") {
    super(401, "unauthorized", message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Middleware d'authentification — supporte trois modes de vérification du JWT,
 * dans cet ordre :
 *
 * 1. **JWKS Supabase (ES256)** si `SUPABASE_URL` est configuré → récupère la
 *    clé publique de l'endpoint `/auth/v1/.well-known/jwks.json` (cache jose).
 *    C'est le format que Supabase utilise depuis 2024 par défaut.
 * 2. **HS256 secret partagé** si `SUPABASE_JWT_SECRET` est défini → vérif via
 *    `jwtVerify(token, secret)`. Mode legacy / self-hosted Supabase.
 * 3. **Decode sans vérif** sinon → utile pour dev local sans Supabase auth.
 *
 * Pose `tenantId` (et `userId`) dans le contexte Hono. Les admins (sub dans
 * `ADMIN_USER_IDS`) peuvent passer sans `tenant_id` — leur tenantId est
 * marqué `"admin"` (sentinel non-UUID, à ignorer côté routes admin).
 */
export function createAuthMiddleware(env: Env) {
  const jwks = env.SUPABASE_URL
    ? createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
    : null;
  const hsSecret = env.SUPABASE_JWT_SECRET
    ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
    : null;
  const adminIds = new Set(
    (env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const allowDevBypass = env.NODE_ENV !== "production";

  return createMiddleware<AppEnv>(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (bearer) {
      let claims: Record<string, unknown>;
      try {
        if (jwks) {
          const { payload } = await jwtVerify(bearer, jwks, { issuer: getExpectedIssuer(env) });
          claims = payload as Record<string, unknown>;
        } else if (hsSecret) {
          const { payload } = await jwtVerify(bearer, hsSecret);
          claims = payload as Record<string, unknown>;
        } else {
          claims = decodeJwt(bearer) as JWTPayload as Record<string, unknown>;
        }
      } catch {
        throw new UnauthorizedError("Token invalide");
      }

      const userId = typeof claims.sub === "string" ? claims.sub : undefined;
      const isAdmin = userId !== undefined && adminIds.has(userId);

      const tenantId = extractTenantId(claims);
      if (tenantId) {
        c.set("tenantId", tenantId);
      } else if (isAdmin) {
        // Admin sans tenant_id : peut spécifier le tenant courant via header
        // X-Tenant-Id (utilisé par le dashboard pour piloter un tenant choisi).
        // Sinon sentinel "admin" — routes /v1/admin/* l'ignorent, autres routes
        // qui exigent UUID rejetteront.
        const overrideTenant = c.req.header("X-Tenant-Id");
        if (overrideTenant && UUID_RE.test(overrideTenant)) {
          c.set("tenantId", overrideTenant);
        } else {
          c.set("tenantId", "admin");
        }
      } else {
        throw new UnauthorizedError("Token sans claim tenant_id");
      }

      if (userId) c.set("userId", userId);
      return next();
    }

    if (allowDevBypass) {
      const devTenant = c.req.header("X-Tenant-Id");
      if (devTenant && UUID_RE.test(devTenant)) {
        c.set("tenantId", devTenant);
        return next();
      }
    }

    throw new UnauthorizedError();
  });
}

function getExpectedIssuer(env: Env): string | undefined {
  return env.SUPABASE_URL ? `${env.SUPABASE_URL}/auth/v1` : undefined;
}

function extractTenantId(claims: Record<string, unknown>): string | null {
  const direct = claims.tenant_id;
  if (typeof direct === "string" && UUID_RE.test(direct)) return direct;
  const userMeta = claims.user_metadata;
  if (userMeta && typeof userMeta === "object") {
    const candidate = (userMeta as Record<string, unknown>).tenant_id;
    if (typeof candidate === "string" && UUID_RE.test(candidate)) return candidate;
  }
  const appMeta = claims.app_metadata;
  if (appMeta && typeof appMeta === "object") {
    const candidate = (appMeta as Record<string, unknown>).tenant_id;
    if (typeof candidate === "string" && UUID_RE.test(candidate)) return candidate;
  }
  return null;
}
