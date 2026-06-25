import "dotenv/config";
import { serve } from "@hono/node-server";
import { getDb } from "@okito/db";
import { type AppServices, createApp } from "./app.js";
import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { ReservationService } from "./services/reservation.js";

const env = loadEnv();

const services: AppServices = {};
if (env.DATABASE_URL) {
  const db = getDb(env.DATABASE_URL);
  services.reservation = new ReservationService(db);
} else {
  logger.warn("DATABASE_URL absent — démarrage en mode dégradé (health only)");
}

const app = createApp(env, services);

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info({ port: info.port, env: env.NODE_ENV }, "okito-api ready");
  },
);
