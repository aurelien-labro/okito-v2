import type { Database } from "@okito/db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Env } from "../lib/env.js";

export interface HealthDeps {
  db?: Database;
}

export function healthRoute(env: Env, deps: HealthDeps = {}) {
  const app = new Hono();

  app.get("/", async (c) => {
    const db = deps.db ? await pingDb(deps.db) : { status: "not_configured" as const };
    const overall = db.status === "error" ? "degraded" : "ok";

    return c.json(
      {
        status: overall,
        service: "okito-api",
        env: env.NODE_ENV,
        llm: {
          status: env.GEMINI_API_KEY ? ("ok" as const) : ("not_configured" as const),
          model: env.LLM_MODEL,
        },
        db,
        timestamp: new Date().toISOString(),
      },
      overall === "ok" ? 200 : 503,
    );
  });

  return app;
}

async function pingDb(
  db: Database,
): Promise<{ status: "ok"; latencyMs: number } | { status: "error"; error: string }> {
  const started = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", latencyMs: Date.now() - started };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
