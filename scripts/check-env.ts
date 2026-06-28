#!/usr/bin/env tsx
/**
 * Vérifie quelles variables d'environnement sont présentes / manquantes pour
 * pouvoir faire tourner OKITO. Sort un rapport clair par groupe + un exit code
 * non-zéro si une variable bloquante manque.
 *
 * Usage :
 *   pnpm check:env             → vérifie .env à la racine
 *   pnpm check:env --prod      → ignore les variables dev-only, exige toutes les prod
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Severity = "required" | "recommended" | "optional";

interface VarSpec {
  name: string;
  severity: Severity;
  hint: string;
}

interface Group {
  label: string;
  vars: VarSpec[];
}

const GROUPS: Group[] = [
  {
    label: "App",
    vars: [
      { name: "NODE_ENV", severity: "required", hint: "development | production" },
      { name: "PORT", severity: "optional", hint: "défaut 3001" },
      { name: "APP_URL", severity: "required", hint: "URL publique du dashboard" },
    ],
  },
  {
    label: "Database (Supabase)",
    vars: [
      { name: "DATABASE_URL", severity: "required", hint: "Supabase → Settings → Database" },
      { name: "SUPABASE_URL", severity: "required", hint: "Supabase → Settings → API" },
      { name: "SUPABASE_ANON_KEY", severity: "required", hint: "Supabase → Settings → API" },
      {
        name: "SUPABASE_SERVICE_ROLE_KEY",
        severity: "required",
        hint: "Supabase → Settings → API",
      },
      {
        name: "SUPABASE_JWT_SECRET",
        severity: "required",
        hint: "Supabase → Settings → API → JWT",
      },
    ],
  },
  {
    label: "LLM (Gemini)",
    vars: [
      { name: "GEMINI_API_KEY", severity: "required", hint: "aistudio.google.com" },
      { name: "LLM_MODEL", severity: "optional", hint: "défaut gemini-2.5-flash" },
      { name: "LLM_FALLBACK_MODEL", severity: "optional", hint: "défaut gemini-2.5-pro" },
    ],
  },
  {
    label: "Voix (Vapi)",
    vars: [
      { name: "VAPI_API_KEY", severity: "recommended", hint: "vapi.ai — sans, pas de canal voix" },
      { name: "VAPI_PUBLIC_KEY", severity: "recommended", hint: "client safe — playground" },
      { name: "VAPI_ASSISTANT_ID", severity: "recommended", hint: "ID de l'assistant configuré" },
    ],
  },
  {
    label: "Email (Resend)",
    vars: [
      { name: "RESEND_API_KEY", severity: "recommended", hint: "resend.com — sans, pas d'emails" },
      { name: "RESEND_FROM_EMAIL", severity: "recommended", hint: "OKITO <bot@tondomaine.com>" },
    ],
  },
  {
    label: "WhatsApp / SMS (Twilio)",
    vars: [
      { name: "TWILIO_ACCOUNT_SID", severity: "recommended", hint: "console.twilio.com" },
      { name: "TWILIO_AUTH_TOKEN", severity: "recommended", hint: "" },
      { name: "TWILIO_WHATSAPP_FROM", severity: "recommended", hint: "+14155238886 (sandbox)" },
      { name: "TWILIO_SMS_FROM", severity: "optional", hint: "canal SMS séparé" },
      { name: "TWILIO_VALIDATE_WEBHOOK", severity: "optional", hint: "true en prod" },
    ],
  },
  {
    label: "WhatsApp alternatif (360dialog)",
    vars: [
      {
        name: "THREE60DIALOG_API_KEY",
        severity: "optional",
        hint: "si défini, supplante Twilio pour WhatsApp",
      },
    ],
  },
  {
    label: "Jobs (Inngest)",
    vars: [
      { name: "INNGEST_SIGNING_KEY", severity: "recommended", hint: "app.inngest.com" },
      { name: "INNGEST_EVENT_KEY", severity: "recommended", hint: "" },
    ],
  },
  {
    label: "Billing (Stripe)",
    vars: [
      { name: "STRIPE_SECRET_KEY", severity: "optional", hint: "sk_test_... pour MVP" },
      { name: "STRIPE_WEBHOOK_SECRET", severity: "optional", hint: "whsec_... du endpoint Stripe" },
    ],
  },
  {
    label: "Admin",
    vars: [
      {
        name: "ADMIN_USER_IDS",
        severity: "recommended",
        hint: "UUIDs Supabase Auth séparés par virgule",
      },
    ],
  },
  {
    label: "Observability",
    vars: [{ name: "SENTRY_DSN", severity: "optional", hint: "sentry.io — recommandé en prod" }],
  },
];

const isProd = process.argv.includes("--prod");
const envFile = resolve(process.cwd(), ".env");

if (!existsSync(envFile)) {
  console.error(`❌ Aucun .env trouvé à ${envFile}`);
  console.error("   → cp .env.example .env puis remplis les valeurs");
  process.exit(1);
}

const env = parseDotenv(readFileSync(envFile, "utf8"));

let missing = 0;
let warnings = 0;

console.log(`\n📋 OKITO env check  (${envFile}${isProd ? " — mode prod" : ""})\n`);

for (const group of GROUPS) {
  const lines: string[] = [];
  for (const v of group.vars) {
    const value = env[v.name];
    const filled = isMeaningful(value);
    const severity = isProd && v.severity === "recommended" ? "required" : v.severity;

    if (filled) {
      lines.push(`  ✅ ${pad(v.name, 28)} ${mask(value)}`);
    } else if (severity === "required") {
      lines.push(`  ❌ ${pad(v.name, 28)} MANQUANT — ${v.hint}`);
      missing++;
    } else if (severity === "recommended") {
      lines.push(`  ⚠️  ${pad(v.name, 28)} non-set — ${v.hint}`);
      warnings++;
    } else {
      lines.push(`  ·  ${pad(v.name, 28)} (optionnel) ${v.hint}`);
    }
  }
  console.log(`▸ ${group.label}`);
  console.log(lines.join("\n"));
  console.log("");
}

console.log(`Résumé : ${missing} manquant·s, ${warnings} recommandé·s non-set\n`);
if (missing > 0) {
  console.error("→ Corrige les valeurs MANQUANT avant de démarrer l'API.\n");
  process.exit(1);
}
console.log("→ Setup minimal OK, tu peux démarrer.\n");

function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function isMeaningful(value: string | undefined): value is string {
  if (!value) return false;
  if (/^(XXX|x{3,}|password|PASSWORD|TODO|change[-_ ]?me)$/i.test(value)) return false;
  if (/^00000000-0000-4000-8000-000000000000$/.test(value)) return false;
  if (value.includes("XXX") || value.includes("tondomaine")) return false;
  return true;
}

function mask(value: string): string {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
