import type { Database } from "@okito/db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Env } from "../lib/env.js";

type ProviderStatus = "configured" | "not_configured";

export function healthRoute(env: Env, db?: Database, isShuttingDown?: () => boolean) {
  const app = new Hono();

  app.get("/", async (c) => {
    // Drain : pendant l'arrêt (SIGTERM Fly), on répond 503 pour que le
    // load-balancer sorte la machine de la rotation avant le kill.
    if (isShuttingDown?.()) {
      return c.json(
        { status: "shutting_down", service: "okito-api", timestamp: new Date().toISOString() },
        503,
      );
    }
    const dbStatus = db ? await pingDb(db) : { status: "not_configured" as const };
    const overall = dbStatus.status === "error" ? "degraded" : "ok";

    return c.json(
      {
        status: overall,
        service: "okito-api",
        env: env.NODE_ENV,
        llm: {
          status: env.GEMINI_API_KEY ? ("ok" as const) : ("not_configured" as const),
          model: env.LLM_MODEL,
        },
        db: dbStatus,
        notifiers: notifierStatus(env),
        voice: voiceStatus(env),
        observability: observabilityStatus(env),
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

/**
 * Statut des providers de notification — basé uniquement sur la présence
 * des env vars (pas de ping réseau pour éviter de cramer du quota à chaque
 * appel /health).
 */
function notifierStatus(env: Env): {
  email: { provider: "resend" | "none"; status: ProviderStatus };
  whatsapp: { provider: "twilio" | "none"; status: ProviderStatus };
  sms: { provider: "twilio" | "none"; status: ProviderStatus };
  webhookSignatureValidation: boolean;
} {
  const resend = !!(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
  const twilioBase = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
  const twilioWa = twilioBase && !!env.TWILIO_WHATSAPP_FROM;
  const twilioSms = twilioBase && !!env.TWILIO_SMS_FROM;

  return {
    email: {
      provider: resend ? "resend" : "none",
      status: resend ? "configured" : "not_configured",
    },
    whatsapp: {
      provider: twilioWa ? "twilio" : "none",
      status: twilioWa ? "configured" : "not_configured",
    },
    sms: {
      provider: twilioSms ? "twilio" : "none",
      status: twilioSms ? "configured" : "not_configured",
    },
    webhookSignatureValidation: env.TWILIO_VALIDATE_WEBHOOK === "true" && !!env.TWILIO_AUTH_TOKEN,
  };
}

function voiceStatus(env: Env): {
  vapi: { status: ProviderStatus; assistantId?: string };
} {
  const configured = !!env.VAPI_PUBLIC_KEY && !!env.VAPI_ASSISTANT_ID;
  return {
    vapi: {
      status: configured ? "configured" : "not_configured",
      ...(env.VAPI_ASSISTANT_ID ? { assistantId: env.VAPI_ASSISTANT_ID } : {}),
    },
  };
}

function observabilityStatus(env: Env): {
  sentry: { status: ProviderStatus };
} {
  return {
    sentry: { status: env.SENTRY_DSN ? "configured" : "not_configured" },
  };
}
