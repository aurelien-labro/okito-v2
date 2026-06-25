import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
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
 * Middleware d'authentification :
 * - Si Authorization: Bearer <token> + SUPABASE_JWT_SECRET → vérifie la signature
 * - Si pas de secret (dev) et un token présent → décode sans vérifier
 * - Si pas de token MAIS NODE_ENV ≠ production ET header X-Tenant-Id présent →
 *   bypass dev (utile pour les freelances qui dev sans toucher Supabase Auth)
 * - Sinon → 401
 *
 * Pose tenantId (et éventuellement userId) dans le contexte Hono.
 */
export function createAuthMiddleware(env: Env) {
  const secretKey = env.SUPABASE_JWT_SECRET
    ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
    : null;
  const allowDevBypass = env.NODE_ENV !== "production";

  return createMiddleware<AppEnv>(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (bearer) {
      const claims = secretKey
        ? await verifySigned(bearer, secretKey)
        : decodeUnsignedPayload(bearer);

      const tenantId = extractTenantId(claims);
      if (!tenantId) throw new UnauthorizedError("Token sans claim tenant_id");

      c.set("tenantId", tenantId);
      if (typeof claims.sub === "string") c.set("userId", claims.sub);
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

async function verifySigned(
  token: string,
  secretKey: Uint8Array,
): Promise<Record<string, unknown>> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as Record<string, unknown>;
  } catch {
    throw new UnauthorizedError("Token invalide");
  }
}

function decodeUnsignedPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) throw new UnauthorizedError("Token mal formé");
  try {
    const json = Buffer.from(parts[1] ?? "", "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new UnauthorizedError("Token mal formé");
  }
}

function extractTenantId(claims: Record<string, unknown>): string | null {
  const direct = claims.tenant_id;
  if (typeof direct === "string" && UUID_RE.test(direct)) return direct;
  const meta = claims.user_metadata;
  if (meta && typeof meta === "object") {
    const candidate = (meta as Record<string, unknown>).tenant_id;
    if (typeof candidate === "string" && UUID_RE.test(candidate)) return candidate;
  }
  return null;
}
