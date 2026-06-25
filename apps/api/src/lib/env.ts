import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("gemini-2.5-flash"),
  LLM_FALLBACK_MODEL: z.string().default("gemini-2.5-pro"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  LLM_RETRY_MAX: z.coerce.number().int().min(0).max(10).default(3),
  SENTRY_DSN: z.string().url().optional(),
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
