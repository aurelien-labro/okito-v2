import { Hono } from "hono";
import { registry } from "../lib/metrics.js";

/**
 * Endpoint Prometheus standard. Non-auth (filet IP / private network côté
 * infra). Si on veut le sécuriser, ajouter un token via header en prod.
 */
export function metricsRoute() {
  const app = new Hono();
  app.get("/", async (c) => {
    const body = await registry.metrics();
    return c.text(body, 200, { "Content-Type": registry.contentType });
  });
  return app;
}
