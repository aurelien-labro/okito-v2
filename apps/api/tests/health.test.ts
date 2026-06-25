import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/lib/env.js";

describe("GET /health", () => {
  it("retourne ok avec config visible", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      PORT: "3001",
      APP_URL: "http://localhost:3000",
      LLM_MODEL: "gemini-2.5-flash",
      LLM_FALLBACK_MODEL: "gemini-2.5-pro",
    } as NodeJS.ProcessEnv);
    const app = createApp(env);

    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      llm: { configured: boolean; model: string };
      db: { configured: boolean };
    };
    expect(body.status).toBe("ok");
    expect(body.llm.model).toBe("gemini-2.5-flash");
    expect(body.llm.configured).toBe(false);
    expect(body.db.configured).toBe(false);
  });

  it("retourne 404 pour route inconnue", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      PORT: "3001",
      APP_URL: "http://localhost:3000",
      LLM_MODEL: "gemini-2.5-flash",
      LLM_FALLBACK_MODEL: "gemini-2.5-pro",
    } as NodeJS.ProcessEnv);
    const app = createApp(env);

    const res = await app.request("/inexistant");
    expect(res.status).toBe(404);
  });
});
