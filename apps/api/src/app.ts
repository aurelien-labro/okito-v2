import { Hono } from "hono";
import type { Env } from "./lib/env.js";
import { HttpError } from "./lib/errors.js";
import type { AppEnv } from "./lib/types.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { healthRoute } from "./routes/health.js";
import { reservationsRoute } from "./routes/reservations.js";
import type { ReservationService } from "./services/reservation.js";

export interface AppServices {
  reservation?: ReservationService;
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
  app.route("/health", healthRoute(env));

  // Routes authentifiées (préfixe /v1).
  if (services.reservation) {
    const v1 = new Hono<AppEnv>();
    v1.use("*", createAuthMiddleware(env));
    v1.route("/reservations", reservationsRoute(services.reservation));
    app.route("/v1", v1);
  }

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Route inconnue" } }, 404));

  return app;
}
