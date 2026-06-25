import type { LLMClient } from "@okito/shared/llm";
import type { Env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { GeminiClient } from "./gemini.js";

export function createLLMClient(env: Env): LLMClient {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY manquant — moteur LLM indisponible. Voir .env.example.");
  }

  return new GeminiClient({
    apiKey: env.GEMINI_API_KEY,
    defaultModel: env.LLM_MODEL,
    fallbackModel: env.LLM_FALLBACK_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
    retryMax: env.LLM_RETRY_MAX,
    onRetry: (err, attempt, delayMs, model) => {
      logger.warn({ attempt, delayMs, model, err: serializeErr(err) }, "llm retry");
    },
    onFallback: (err, from, to) => {
      logger.warn({ from, to, err: serializeErr(err) }, "llm fallback to secondary model");
    },
  });
}

function serializeErr(err: unknown): { message: string; status?: number } {
  if (err instanceof Error) {
    const e = err as Error & { status?: unknown };
    return {
      message: err.message,
      status: typeof e.status === "number" ? e.status : undefined,
    };
  }
  return { message: String(err) };
}
