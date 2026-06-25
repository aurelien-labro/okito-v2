import type { Database } from "@okito/db";
import { Hono } from "hono";
import type { Env } from "./lib/env.js";
import { HttpError } from "./lib/errors.js";
import type { AppEnv } from "./lib/types.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { chatRoute } from "./routes/chat.js";
import { healthRoute } from "./routes/health.js";
import { reservationsRoute } from "./routes/reservations.js";
import type { ChatService } from "./services/chat.js";
import type { ReservationService } from "./services/reservation.js";

export interface AppServices {
  reservation?: ReservationService;
  chat?: ChatService;
  /** Si fourni, /health ping la DB. Sinon /health remonte db.status="not_configured". */
  db?: Database;
}

export function createApp(env: Env, services: AppServices = {}) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    return c.json({ error: { code: "internal_error", message: "Erreur serveur" } }, 500);
  });

  // Public.
  app.route("/health", healthRoute(env, { db: services.db }));

  // Routes authentifiées (préfixe /v1).
  const hasAuthRoutes = services.reservation || services.chat;
  if (hasAuthRoutes) {
    const v1 = new Hono<AppEnv>();
    v1.use("*", createAuthMiddleware(env));
    if (services.reservation) v1.route("/reservations", reservationsRoute(services.reservation));
    if (services.chat) v1.route("/chat", chatRoute(services.chat));
    app.route("/v1", v1);
  }

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Route inconnue" } }, 404));

  return app;
}
