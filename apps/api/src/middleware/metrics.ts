import type { MiddlewareHandler } from "hono";
import { httpRequestDurationMs, httpRequestsTotal } from "../lib/metrics.js";

/**
 * Middleware Hono qui mesure latence + compteur d'erreurs pour chaque requête.
 *
 * Label `route` = template Hono (`/v1/reservations/:id`) — pas l'URL réelle,
 * sinon explosion de cardinalité. `status` = code HTTP en groupe (2xx, 4xx…).
 */
export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  const route = c.req.routePath ?? c.req.path;
  const method = c.req.method;
  const status = String(c.res.status);
  httpRequestsTotal.inc({ method, route, status });
  httpRequestDurationMs.observe({ method, route, status }, duration);
};
