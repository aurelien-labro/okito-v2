import { Hono } from "hono";
import type { Env } from "../lib/env.js";

export function healthRoute(env: Env) {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json({
      status: "ok",
      service: "okito-api",
      env: env.NODE_ENV,
      llm: {
        configured: Boolean(env.GEMINI_API_KEY),
        model: env.LLM_MODEL,
      },
      db: {
        configured: Boolean(env.DATABASE_URL),
      },
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
