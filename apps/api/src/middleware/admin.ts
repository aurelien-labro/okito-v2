import { createMiddleware } from "hono/factory";
import { HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";

class ForbiddenError extends HttpError {
  constructor(message = "Action réservée aux administrateurs") {
    super(403, "forbidden", message);
  }
}

/**
 * Middleware qui vérifie que l'utilisateur authentifié fait partie de la
 * whitelist `ADMIN_USER_IDS` (env, UUIDs Supabase séparés par virgule).
 *
 * À combiner après `createAuthMiddleware` qui pose `userId` dans le contexte.
 */
export function createAdminMiddleware(adminUserIds: string[]) {
  const set = new Set(adminUserIds.map((s) => s.trim()).filter(Boolean));
  return createMiddleware<AppEnv>(async (c, next) => {
    const userId = c.get("userId");
    if (!userId || !set.has(userId)) {
      throw new ForbiddenError();
    }
    return next();
  });
}
