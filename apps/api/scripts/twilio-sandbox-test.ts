/**
 * Smoke test du provider Twilio WhatsApp (et SMS si configuré).
 *
 * Valide en 30 sec qu'on a bien les bonnes clés, la bonne route réseau, et
 * que le sandbox / numéro de prod accepte nos envois.
 *
 * Sandbox setup avant de lancer :
 *   1. https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
 *   2. Depuis le téléphone destinataire, envoyer "join <code-sandbox>" au
 *      numéro Twilio sandbox (+14155238886)
 *   3. .env :
 *        TWILIO_ACCOUNT_SID=ACxxxxx
 *        TWILIO_AUTH_TOKEN=xxxxx
 *        TWILIO_WHATSAPP_FROM=+14155238886
 *        TWILIO_SMS_FROM=+...        # optionnel
 *
 * Usage :
 *   pnpm --filter @okito/api exec tsx scripts/twilio-sandbox-test.ts \
 *       --to +33612345678                # canal whatsapp par défaut
 *   pnpm --filter @okito/api exec tsx scripts/twilio-sandbox-test.ts \
 *       --to +33612345678 --channel sms --body "Test SMS OKITO"
 */
import "dotenv/config";
import { loadEnv } from "../src/lib/env.js";
import { TwilioSmsNotifier } from "../src/services/twilio-sms-notifier.js";
import { TwilioWhatsAppNotifier } from "../src/services/twilio-whatsapp-notifier.js";

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

async function main(): Promise<void> {
  const to = arg("to");
  const channel = (arg("channel", "whatsapp") ?? "whatsapp") as "whatsapp" | "sms";
  const body =
    arg("body") ??
    `Test OKITO ${channel.toUpperCase()} — ${new Date().toLocaleTimeString("fr-FR")}`;

  if (!to) {
    console.error("Usage: --to +E164 [--channel whatsapp|sms] [--body 'message']");
    process.exit(1);
  }
  if (!to.startsWith("+")) {
    console.error(`--to doit être au format E.164 (commence par +), reçu: ${to}`);
    process.exit(1);
  }

  const env = loadEnv();
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    console.error("TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN absents du .env");
    process.exit(1);
  }

  const fromVar = channel === "whatsapp" ? env.TWILIO_WHATSAPP_FROM : env.TWILIO_SMS_FROM;
  if (!fromVar) {
    console.error(
      `${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_SMS_FROM"} absent du .env`,
    );
    process.exit(1);
  }

  console.log(`→ envoi ${channel} de ${fromVar} vers ${maskPhone(to)}`);
  console.log(`  body: "${body}"`);

  const notifier =
    channel === "whatsapp"
      ? new TwilioWhatsAppNotifier({
          accountSid: env.TWILIO_ACCOUNT_SID,
          authToken: env.TWILIO_AUTH_TOKEN,
          from: fromVar,
        })
      : new TwilioSmsNotifier({
          accountSid: env.TWILIO_ACCOUNT_SID,
          authToken: env.TWILIO_AUTH_TOKEN,
          from: fromVar,
        });

  const result = await notifier.send({
    tenantId: "sandbox-test",
    channel,
    to,
    body,
    context: { type: "smoke_test" },
  });

  if (result.delivered) {
    console.log(`✓ OK — externalId=${result.externalId} provider=${result.provider}`);
    console.log("  Vérifie sur le téléphone destinataire (peut prendre 5-30 sec).");
    process.exit(0);
  } else {
    console.error(`✖ Échec — provider=${result.provider} error=${result.error ?? "?"}`);
    if (result.error?.startsWith("HTTP 4")) {
      console.error(
        "  4xx Twilio = config invalide. Causes typiques :",
        "\n    - destinataire pas joint au sandbox (`join <code>`)",
        "\n    - numéro From pas autorisé sur le compte",
        "\n    - WhatsApp Business pas approuvé en prod",
      );
    }
    process.exit(1);
  }
}

function maskPhone(p: string): string {
  if (p.length < 6) return "***";
  return `${p.slice(0, 4)}***${p.slice(-2)}`;
}

main().catch((err) => {
  console.error("Exception fatale :", err);
  process.exit(1);
});
