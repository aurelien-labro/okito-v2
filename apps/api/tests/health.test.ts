import type { Database } from "@okito/db";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/lib/env.js";

const baseEnv = {
  NODE_ENV: "test",
  PORT: "3001",
  APP_URL: "http://localhost:3000",
  LLM_MODEL: "gemini-2.5-flash",
  LLM_FALLBACK_MODEL: "gemini-2.5-pro",
} as NodeJS.ProcessEnv;

describe("GET /health", () => {
  it("renvoie ok + db/llm not_configured quand rien n'est branché", async () => {
    const env = loadEnv(baseEnv);
    const app = createApp(env);

    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      llm: { status: string; model: string };
      db: { status: string };
    };
    expect(body.status).toBe("ok");
    expect(body.llm.model).toBe("gemini-2.5-flash");
    expect(body.llm.status).toBe("not_configured");
    expect(body.db.status).toBe("not_configured");
  });

  it("ping la DB si fournie et renvoie latence", async () => {
    const env = loadEnv(baseEnv);
    const execute = vi.fn().mockResolvedValue([{ "?column?": 1 }]);
    const app = createApp(env, { db: { execute } as unknown as Database });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { db: { status: string; latencyMs?: number } };
    expect(body.db.status).toBe("ok");
    expect(typeof body.db.latencyMs).toBe("number");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("renvoie 503 + db.status=error si la DB ne répond pas", async () => {
    const env = loadEnv(baseEnv);
    const execute = vi.fn().mockRejectedValue(new Error("connection refused"));
    const app = createApp(env, { db: { execute } as unknown as Database });

    const res = await app.request("/health");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; db: { status: string; error: string } };
    expect(body.status).toBe("degraded");
    expect(body.db.status).toBe("error");
    expect(body.db.error).toMatch(/connection refused/);
  });

  it("retourne 404 pour route inconnue", async () => {
    const env = loadEnv(baseEnv);
    const app = createApp(env);
    const res = await app.request("/inexistant");
    expect(res.status).toBe(404);
  });
});
