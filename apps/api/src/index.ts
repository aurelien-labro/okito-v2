import "dotenv/config";
import { serve } from "@hono/node-server";
import { getDb } from "@okito/db";
import { type AppServices, createApp } from "./app.js";
import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { ChatService } from "./services/chat.js";
import { ConversationService } from "./services/conversation.js";
import { createLLMClient } from "./services/llm/index.js";
import { ReservationService } from "./services/reservation.js";
import { TenantService } from "./services/tenant.js";

const env = loadEnv();

const services: AppServices = {};
if (env.DATABASE_URL) {
  const db = getDb(env.DATABASE_URL);
  const reservation = new ReservationService(db);
  const conversation = new ConversationService(db);
  const tenant = new TenantService(db);
  services.reservation = reservation;

  if (env.GEMINI_API_KEY) {
    const llm = createLLMClient(env);
    services.chat = new ChatService({ llm, conversation, reservation, tenant });
  } else {
    logger.warn("GEMINI_API_KEY absent — moteur conversationnel désactivé");
  }
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
