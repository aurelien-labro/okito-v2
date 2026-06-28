import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_JWT_SECRET: z.string().min(16).optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("gemini-2.5-flash"),
  LLM_FALLBACK_MODEL: z.string().default("gemini-2.5-pro"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  LLM_RETRY_MAX: z.coerce.number().int().min(0).max(10).default(3),
  SENTRY_DSN: z.string().url().optional(),
  VAPI_PUBLIC_KEY: z.string().optional(),
  VAPI_ASSISTANT_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  /** Adresse expéditeur autorisée chez Resend, ex: "OKITO <bot@okito.app>". */
  RESEND_FROM_EMAIL: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  /** Numéro WhatsApp Twilio en E.164 (sans préfixe "whatsapp:"), ex: "+14155238886". */
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  /** Numéro SMS Twilio en E.164. Peut différer du numéro WhatsApp. */
  TWILIO_SMS_FROM: z.string().optional(),
  /** Si "true" et TWILIO_AUTH_TOKEN défini, valide la signature X-Twilio-Signature sur les webhooks. */
  TWILIO_VALIDATE_WEBHOOK: z.enum(["true", "false"]).optional(),
  /** UUIDs Supabase Auth des utilisateurs admin (CRUD tenants), séparés par virgule. */
  ADMIN_USER_IDS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variables d'environnement invalides:\n${issues}`);
  }
  return parsed.data;
}
