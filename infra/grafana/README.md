# Grafana — Dashboard OKITO API

## Fichier
`okito-api.json` — dashboard 7 panels couvrant trafic HTTP + métier (réservations, chat, notifs, rate limits).

## Prérequis
- Une instance Grafana (Fly Grafana auto-scrape, Grafana Cloud, ou self-hosted)
- Une datasource **Prometheus** qui scrape `/metrics` de l'API OKITO (toutes les 15-30s)

## Import
1. Grafana → **Dashboards → New → Import**
2. *Upload JSON file* → choisir `infra/grafana/okito-api.json`
3. Sélectionner ta datasource Prometheus dans le dropdown `DS_PROMETHEUS`
4. **Import**

Le dashboard s'ouvre avec auto-refresh 30s.

## Métriques utilisées (alignement avec apps/api/src/lib/metrics.ts)

| Métrique | Type | Labels |
|---|---|---|
| `okito_http_requests_total` | Counter | `method`, `route`, `status` |
| `okito_http_request_duration_ms` | Histogram | `method`, `route`, `status` |
| `okito_reservations_created_total` | Counter | `source` |
| `okito_reservations_cancelled_total` | Counter | — |
| `okito_chat_handled_total` | Counter | `channel` |
| `okito_rate_limited_total` | Counter | `endpoint` |
| `okito_notifier_sent_total` | Counter | `channel`, `provider`, `status` |

Plus les métriques `okito_*` par défaut de `prom-client` (process, heap, GC, etc.).

## Alertes (à ajouter en Grafana UI)
Le dashboard ne contient pas d'alertes (préférer la config side-car des dashboards). Suggestions :
- **5xx > 5 req/min sur 5 min** → page oncall
- **Latence p95 > 2s sur 10 min** → warning
- **Aucune résa créée sur 1h en heure d'ouverture** → warning (peut indiquer un bug widget/Vapi/Whatsapp)
- **Notifier status="error" > 1 req/min** → warning (provider down)

## Fly.io
Si l'API tourne sur Fly avec Grafana Cloud auto-scrape activé, ajouter dans `fly.toml` :
```toml
[[metrics]]
  port = 3001
  path = "/metrics"
```
Puis `fly deploy`. Grafana Cloud scrape automatiquement les apps Fly avec `[[metrics]]`.
