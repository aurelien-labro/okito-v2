import { describe, expect, it } from "vitest";
import type { Env } from "../lib/env.js";
import { healthRoute } from "./health.js";

/**
 * Contrat HTTP de /health — notamment le drain Fly : pendant l'arrêt
 * (SIGTERM), la route doit répondre 503 pour sortir la machine de la
 * rotation du load-balancer avant le kill.
 */

const env = { NODE_ENV: "test", LLM_MODEL: "gemini-test" } as Env;

describe("healthRoute", () => {
  it("répond 200 ok sans DB configurée", async () => {
    const app = healthRoute(env);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; db: { status: string } };
    expect(body.status).toBe("ok");
    expect(body.db.status).toBe("not_configured");
  });

  it("répond 503 shutting_down pendant le drain", async () => {
    const app = healthRoute(env, undefined, () => true);
    const res = await app.request("/");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("shutting_down");
  });

  it("ignore le drain tant que isShuttingDown est faux", async () => {
    let down = false;
    const app = healthRoute(env, undefined, () => down);
    expect((await app.request("/")).status).toBe(200);
    down = true;
    expect((await app.request("/")).status).toBe(503);
  });
});
