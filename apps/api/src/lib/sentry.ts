/**
 * Wrapper Sentry minimal.
 *
 * - initSentry est idempotent et no-op si SENTRY_DSN absent (dev local).
 * - PII scrubbing dans beforeSend : retire les headers d'auth, les bodies
 *   capturés, et les valeurs ressemblant à un E.164 ou un email dans les
 *   messages d'exception (filet de sécurité, on ne devrait jamais en logger).
 */

import * as Sentry from "@sentry/node";
import type { Env } from "./env.js";

const PHONE_RE = /\+?\d[\d\s\-.()]{7,}\d/g;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

let initialised = false;

export function initSentry(env: Env): void {
  if (initialised || !env.SENTRY_DSN) return;
  initialised = true;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialised) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request?.headers) {
    event.request.headers.authorization = undefined;
    event.request.headers.cookie = undefined;
    event.request.headers["x-tenant-id"] = undefined;
  }
  // On ne capture jamais le body d'une requête → mais filet de sécurité.
  if (event.request) event.request.data = undefined;

  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = redact(ex.value);
  }
  if (event.message) event.message = redact(event.message);

  return event;
}

function redact(input: string): string {
  return input.replace(PHONE_RE, "[redacted-phone]").replace(EMAIL_RE, "[redacted-email]");
}

// Exporté pour les tests (reset entre cas).
export function _resetSentryForTests(): void {
  initialised = false;
}
