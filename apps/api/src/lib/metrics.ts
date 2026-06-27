import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Registre Prometheus dédié à l'API OKITO.
 *
 * Métriques exposées sur GET /metrics (format Prometheus). Branchées via
 * un middleware Hono qui mesure la latence + un compteur d'erreurs.
 *
 * Bonnes pratiques :
 * - labels low-cardinality uniquement (pas de tenantId ni d'IP — cardinalité)
 * - pas de PII dans les labels
 * - compteurs cumulatifs (la diff sur fenêtre est le rôle de Prometheus)
 */

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "okito_" });

export const httpRequestsTotal = new Counter({
  name: "okito_http_requests_total",
  help: "Nombre total de requêtes HTTP, ventilé par méthode/route/code",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

export const httpRequestDurationMs = new Histogram({
  name: "okito_http_request_duration_ms",
  help: "Latence des requêtes HTTP en millisecondes",
  labelNames: ["method", "route", "status"] as const,
  buckets: [5, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [registry],
});

export const reservationsCreated = new Counter({
  name: "okito_reservations_created_total",
  help: "Réservations créées avec succès, ventilé par source",
  labelNames: ["source"] as const,
  registers: [registry],
});

export const reservationsCancelled = new Counter({
  name: "okito_reservations_cancelled_total",
  help: "Réservations annulées",
  registers: [registry],
});

export const chatHandled = new Counter({
  name: "okito_chat_handled_total",
  help: "Messages traités par ChatService, ventilé par canal",
  labelNames: ["channel"] as const,
  registers: [registry],
});

export const rateLimitedTotal = new Counter({
  name: "okito_rate_limited_total",
  help: "Requêtes bloquées par rate limiter, ventilé par endpoint",
  labelNames: ["endpoint"] as const,
  registers: [registry],
});

export const notifierSent = new Counter({
  name: "okito_notifier_sent_total",
  help: "Messages envoyés par le notifier, ventilé par canal + statut",
  labelNames: ["channel", "provider", "status"] as const,
  registers: [registry],
});
