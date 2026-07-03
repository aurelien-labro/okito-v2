import type { ErrorEvent } from "@sentry/node";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockInit, mockCapture } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
  init: mockInit,
  captureException: mockCapture,
}));

import type { Env } from "./env.js";
import { _resetSentryForTests, captureException, initSentry, scrubEvent } from "./sentry.js";

const baseEnv: Env = {
  NODE_ENV: "production",
  PORT: 3001,
  APP_URL: "http://localhost:3000",
  PORTAL_URL: "https://okito.app",
  PUBLIC_API_URL: "http://localhost:3001",
  LLM_MODEL: "gemini-2.5-flash",
  LLM_FALLBACK_MODEL: "gemini-2.5-pro",
  LLM_TIMEOUT_MS: 15000,
  LLM_RETRY_MAX: 3,
};

afterEach(() => {
  mockInit.mockReset();
  mockCapture.mockReset();
  _resetSentryForTests();
});

describe("initSentry", () => {
  it("no-op si SENTRY_DSN absent", () => {
    initSentry(baseEnv);
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("init Sentry avec DSN + environment + beforeSend", () => {
    initSentry({ ...baseEnv, SENTRY_DSN: "https://abc@sentry.io/123" });
    expect(mockInit).toHaveBeenCalledOnce();
    const config = mockInit.mock.calls[0]?.[0];
    expect(config.dsn).toBe("https://abc@sentry.io/123");
    expect(config.environment).toBe("production");
    expect(config.sendDefaultPii).toBe(false);
    expect(typeof config.beforeSend).toBe("function");
  });

  it("idempotent : 2 appels = 1 seul init", () => {
    initSentry({ ...baseEnv, SENTRY_DSN: "https://abc@sentry.io/123" });
    initSentry({ ...baseEnv, SENTRY_DSN: "https://abc@sentry.io/123" });
    expect(mockInit).toHaveBeenCalledOnce();
  });
});

describe("captureException", () => {
  it("no-op si Sentry pas initialisé", () => {
    captureException(new Error("boom"));
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("relai vers Sentry si initialisé", () => {
    initSentry({ ...baseEnv, SENTRY_DSN: "https://abc@sentry.io/123" });
    captureException(new Error("boom"), { path: "/v1/chat" });
    expect(mockCapture).toHaveBeenCalledOnce();
    expect(mockCapture.mock.calls[0]?.[1]).toMatchObject({ extra: { path: "/v1/chat" } });
  });
});

describe("scrubEvent (PII redaction)", () => {
  it("supprime headers d'auth + cookie + x-tenant-id", () => {
    const event = {
      request: {
        headers: {
          authorization: "Bearer secret",
          cookie: "sess=abc",
          "x-tenant-id": "uuid",
          "user-agent": "Chrome",
        },
      },
    } as unknown as ErrorEvent;
    const scrubbed = scrubEvent(event);
    expect(scrubbed.request?.headers?.authorization).toBeUndefined();
    expect(scrubbed.request?.headers?.cookie).toBeUndefined();
    expect(scrubbed.request?.headers?.["x-tenant-id"]).toBeUndefined();
    expect(scrubbed.request?.headers?.["user-agent"]).toBe("Chrome");
  });

  it("redacte téléphones et emails dans le message d'exception", () => {
    const event = {
      exception: {
        values: [
          {
            type: "Error",
            value: "création résa échouée pour +33611111111 / jean@example.com",
          },
        ],
      },
    } as unknown as ErrorEvent;
    const scrubbed = scrubEvent(event);
    const value = scrubbed.exception?.values?.[0]?.value ?? "";
    expect(value).not.toMatch(/\+33611111111/);
    expect(value).not.toMatch(/jean@example\.com/);
    expect(value).toMatch(/\[redacted-phone\]/);
    expect(value).toMatch(/\[redacted-email\]/);
  });

  it("supprime request.data même si présent", () => {
    const event = {
      request: { data: { customerPhone: "+33611111111" } },
    } as unknown as ErrorEvent;
    const scrubbed = scrubEvent(event);
    expect(scrubbed.request?.data).toBeUndefined();
  });
});
