import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Base des liens portail client /r/:token (landing). */
  PORTAL_URL: z.string().url().default("https://okito.app"),
  /** Secret HMAC des flux iCal publics signés. Si absent, le feed webcal est désactivé. */
  ICAL_FEED_SECRET: z.string().min(16).optional(),
  /** URL publique de l'API (base des flux iCal). */
  PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
  /** Secret HMAC des liens d'avis post-visite signés. Absent → demandes d'avis désactivées. */
  REVIEW_LINK_SECRET: z.string().min(16).optional(),
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
  /**
   * Clé API 360dialog (BSP officiel Meta). Si définie, prend la priorité sur
   * Twilio pour le canal WhatsApp — économie 30-40% à partir de ~1000 msg/mois.
   */
  THREE60DIALOG_API_KEY: z.string().optional(),
  /** OAuth Google (ingestion Gmail). Les 3 requis pour activer la connexion de boîtes. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** URL de callback enregistrée dans la console GCP, ex: http://localhost:3001/oauth/google/callback */
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  /** Clé API Places (onboarding : scan fiche Google Business). Optionnelle. */
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  /**
   * URL de callback OAuth pour Google Business Profile (avis Google). Réutilise
   * GOOGLE_CLIENT_ID/SECRET mais une redirect URI dédiée (scope business.manage
   * en plus). Ex: http://localhost:3001/oauth/google-business/callback.
   * Requiert que l'API Business Profile soit validée par Google pour le projet.
   */
  GOOGLE_BUSINESS_REDIRECT_URI: z.string().url().optional(),
  /**
   * URL de callback OAuth pour Google Calendar (import des créneaux occupés).
   * Réutilise GOOGLE_CLIENT_ID/SECRET, redirect URI dédiée (scope
   * calendar.readonly). Ex: http://localhost:3001/oauth/google-calendar/callback.
   */
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().url().optional(),
  /**
   * URL de callback OAuth pour Google Ads (dépenses pub). Réutilise
   * GOOGLE_CLIENT_ID/SECRET, redirect URI dédiée (scope adwords).
   * Ex: http://localhost:3001/oauth/google-ads/callback.
   */
  GOOGLE_ADS_REDIRECT_URI: z.string().url().optional(),
  /** OAuth Meta (Facebook & Instagram). Les 3 requis pour activer la connexion. */
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  /** URL de callback enregistrée dans le portail Meta, ex: http://localhost:3001/oauth/meta/callback */
  META_REDIRECT_URI: z.string().url().optional(),
  /** OAuth Microsoft (ingestion Outlook/365). Les 3 requis pour activer la connexion. */
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  /** URL de callback enregistrée dans le portail Azure, ex: http://localhost:3001/oauth/microsoft/callback */
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
  /** Clé API Deepgram (STT du pipeline voix maison). Optionnelle. */
  DEEPGRAM_API_KEY: z.string().optional(),
  /** Clé API ElevenLabs (TTS du pipeline voix maison). Optionnelle. */
  ELEVENLABS_API_KEY: z.string().optional(),
  /** Voix ElevenLabs par défaut (voiceId). Optionnelle — défaut multilingue. */
  ELEVENLABS_VOICE_ID: z.string().optional(),
  /** Secret HMAC liant un appel Twilio à son tenant. Active le streaming voix. */
  VOICE_STREAM_SECRET: z.string().min(16).optional(),
  /** URL publique du WebSocket Media Streams, ex: wss://api.okito.app/v1/voice/stream */
  VOICE_STREAM_PUBLIC_URL: z.string().url().optional(),
  /** Clé AES-256 (64 hex) chiffrant les mots de passe IMAP. Active les boîtes IMAP/Yahoo. */
  MAILBOX_ENC_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  /** UUIDs Supabase Auth des utilisateurs admin (CRUD tenants), séparés par virgule. */
  ADMIN_USER_IDS: z.string().optional(),
  /** Clé secrète Stripe (sk_test_... ou sk_live_...). Active la route checkout + webhook. */
  STRIPE_SECRET_KEY: z.string().optional(),
  /** Secret du webhook endpoint (whsec_...) pour vérifier les signatures Stripe. */
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Price ID du plan unique OKITO (price_...). Avec STRIPE_SECRET_KEY, active /v1/admin/billing. */
  STRIPE_PRICE_ID: z.string().optional(),
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
