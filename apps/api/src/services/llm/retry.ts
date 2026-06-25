/**
 * Retry exponentiel pour les appels LLM.
 * Récupérable : 429, 5xx, timeout, erreurs réseau (forme inconnue).
 * Non-récupérable : 4xx hors 429.
 */

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const isRetryable = opts.isRetryable ?? isRetryableLLMError;
  let lastErr: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt === opts.maxAttempts - 1;
      if (isLast || !isRetryable(err)) throw err;
      const delay = opts.baseDelayMs * 2 ** attempt;
      opts.onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

export function isRetryableLLMError(err: unknown): boolean {
  if (!err || typeof err !== "object") return true;
  const e = err as { status?: unknown; code?: unknown };
  const raw = typeof e.status === "number" ? e.status : typeof e.code === "number" ? e.code : null;
  if (raw === null) return true; // shape inconnue (réseau, timeout) → retry
  if (raw === 429) return true;
  if (raw >= 500 && raw < 600) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
