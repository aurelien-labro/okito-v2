/**
 * Intérim vague 4 : crée l'agent conversationnel ElevenLabs « OKITO » (FR).
 * Le rattachement d'un numéro de téléphone se fait ensuite dans le dashboard
 * ElevenLabs (Agents → Phone numbers → Import Twilio).
 * Usage : pnpm --filter @okito/api exec tsx scripts/create-elevenlabs-agent.ts
 */
import "dotenv/config";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY manquante");

const PROMPT = `Tu es la réceptionniste téléphonique du restaurant Compagny (système OKITO).
Ta mission : prendre les réservations (date, heure, nombre de personnes, nom, téléphone),
répondre aux questions pratiques (horaires, adresse) et rester chaleureuse et concise.
Parle naturellement, une question à la fois. Si le client parle une autre langue, réponds
dans sa langue. Ne promets rien que tu ne peux pas confirmer ; en cas de doute, propose
qu'un membre de l'équipe rappelle.`;

const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
  method: "POST",
  headers: { "xi-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "OKITO — Réceptionniste Compagny (intérim)",
    conversation_config: {
      agent: {
        language: "fr",
        first_message: "Bonjour, restaurant Compagny, que puis-je faire pour vous ?",
        prompt: { prompt: PROMPT },
      },
      tts: { model_id: "eleven_flash_v2_5" },
    },
  }),
});
const text = await res.text();
if (!res.ok) throw new Error(`create agent HTTP ${res.status} : ${text}`);
const agent = JSON.parse(text) as { agent_id: string };
console.log(`Agent créé : ${agent.agent_id}`);
console.log(`Test navigateur : https://elevenlabs.io/app/talk-to?agent_id=${agent.agent_id}`);
process.exit(0);
