import { Hono } from "hono";
import type { Env } from "./lib/env.js";
import { HttpError } from "./lib/errors.js";
import { healthRoute } from "./routes/health.js";

export function createApp(env: Env) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    return c.json({ error: { code: "internal_error", message: "Erreur serveur" } }, 500);
  });

  app.route("/health", healthRoute(env));

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Route inconnue" } }, 404));

  return app;
}
