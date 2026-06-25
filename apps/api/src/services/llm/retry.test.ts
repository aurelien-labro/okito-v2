import { describe, expect, it, vi } from "vitest";
import { isRetryableLLMError, withRetry } from "./retry.js";

describe("isRetryableLLMError", () => {
  it("429 → retryable", () => {
    expect(isRetryableLLMError({ status: 429 })).toBe(true);
  });

  it("500-503 → retryable", () => {
    expect(isRetryableLLMError({ status: 500 })).toBe(true);
    expect(isRetryableLLMError({ status: 503 })).toBe(true);
  });

  it("400/401/404 → non retryable", () => {
    expect(isRetryableLLMError({ status: 400 })).toBe(false);
    expect(isRetryableLLMError({ status: 401 })).toBe(false);
    expect(isRetryableLLMError({ status: 404 })).toBe(false);
  });

  it("erreur sans status (network, timeout) → retryable", () => {
    expect(isRetryableLLMError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableLLMError(undefined)).toBe(true);
  });
});

describe("withRetry", () => {
  it("renvoie le résultat au premier essai si pas d'erreur", async () => {
    const fn = vi.fn().mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retente sur erreur récupérable jusqu'à succès", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce("ok");
    const onRetry = vi.fn();
    const result = await withRetry(fn, { maxAttempts: 5, baseDelayMs: 1, onRetry });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("abandonne immédiatement sur erreur non récupérable", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400, message: "bad" });
    await expect(withRetry(fn, { maxAttempts: 5, baseDelayMs: 1 })).rejects.toMatchObject({
      status: 400,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throw la dernière erreur après maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toMatchObject({
      status: 503,
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
