/**
 * Test exhaustif du bot : joue ~15 scénarios représentatifs (cas nominaux + cas
 * piégeux) contre /vapi/llm en local, affiche les transcripts pour repérer
 * d'un coup d'œil les comportements absurdes / perroquet / blocages.
 *
 * Usage : pnpm --filter @okito/api exec tsx scripts/test-scenarios.ts
 */
import "dotenv/config";

const API_URL = process.env.OKITO_API_URL ?? "http://localhost:3001";
const TENANT_ID = process.env.OKITO_TEST_TENANT_ID ?? "2853f3bc-cc57-46c1-959e-a07354feb505";

interface Scenario {
  name: string;
  description: string;
  turns: string[];
  /** Validations facultatives — substrings ou regex à matcher dans la dernière réponse. */
  expectAtEnd?: Array<string | RegExp>;
  /** Substrings/regex qui ne doivent PAS apparaître dans aucune réponse. */
  forbid?: Array<string | RegExp>;
}

const SCENARIOS: Scenario[] = [
  {
    name: "1. Happy direct + confirmation",
    description: "Tout en un message, le bot vérifie dispo, on confirme",
    turns: [
      "Bonjour je veux réserver pour 4 personnes demain à 20h30 au nom de Marc Dupuis 0612345678",
      "Oui parfait je confirme",
    ],
    expectAtEnd: [/noté|confirmé|à bientôt|à très vite|à demain/i],
  },
  {
    name: "2. Pas-à-pas, 1 champ par tour",
    description: "Cas pédagogique, vérifie que le bot ne redemande pas",
    turns: [
      "Salut",
      "Je veux réserver",
      "4 personnes",
      "demain",
      "20h30",
      "Jean Petit",
      "0623456789",
      "oui c'est bon",
    ],
    expectAtEnd: [/noté|confirmé|à bientôt|à très vite|à demain/i],
    forbid: [/combien de personnes.*combien de personnes/is],
  },
  {
    name: "3. Changement d'avis en cours",
    description: "Le client donne 4, puis dit 'non finalement 5'",
    turns: [
      "Je veux réserver pour 4 personnes demain à 20h",
      "Ah non finalement 5 personnes",
      "Mon nom est Sarah Cohen",
      "0633334444",
      "ok confirme",
    ],
    expectAtEnd: [/noté|confirmé|à bientôt|à très vite|à demain/i],
    forbid: [/pour 4 personnes/i],
  },
  {
    name: "4. Multi-infos d'un seul coup",
    description: "Le client lâche 3 champs en un tour",
    turns: ["Marc Leblanc 0644445555 pour 2 demain 19h30", "go"],
    expectAtEnd: [/noté|confirmé|à bientôt|à très vite|à demain/i],
  },
  {
    name: "5. Hors-sujet menu",
    description: "Le client demande le menu, le bot doit rediriger",
    turns: [
      "Vous avez quoi comme menu ?",
      "Ok je veux juste réserver pour 2 demain 20h",
      "Léa Martin 0655556666",
      "oui",
    ],
    expectAtEnd: [/noté|confirmé|à bientôt|à très vite|à demain/i],
    forbid: [/pizza|pasta|carte|formule|entrée|plat|dessert/i],
  },
  {
    name: "6. Date impossible (35 décembre)",
    description: "Doit refuser poliment et redemander",
    turns: ["Réserve pour 2 le 35 décembre à 20h"],
    expectAtEnd: [/n'existe pas|impossible|pas valable|laquelle|quel jour|quelle date/i],
  },
  {
    name: "7. Heure hors service (3h du matin)",
    description: "Doit refuser et proposer les bonnes plages",
    turns: ["Je veux réserver demain à 3h du matin pour 2"],
    expectAtEnd: [/déjeuner|dîner|service|pas ouvert|12h|19h/i],
  },
  {
    name: "8. >20 personnes",
    description: "Doit refuser et orienter",
    turns: ["Je voudrais réserver pour 30 personnes demain 20h"],
    expectAtEnd: [/groupe|appeler|directement|salle|privative|contacter/i],
  },
  {
    name: "9. Téléphone bidon",
    description: "Doit redemander gentiment",
    turns: ["Pour 2 demain 20h", "Marc Dupuis", "123"],
    expectAtEnd: [/numéro|téléphone|pas bien noté|redire|saisir/i],
  },
  {
    name: "10. Annulation",
    description: "Court-circuit annulation",
    turns: ["Je veux annuler ma résa", "demain", "0612345678"],
  },
  {
    name: "11. Plusieurs intentions",
    description: "Annule + nouvelle résa dans le même message",
    turns: [
      "Annule ma résa de samedi et fais m'en une dimanche soir à 20h pour 2 au nom de Léa Vidal 0677778888",
      "oui parfait",
    ],
  },
  {
    name: "12. Pression / urgence",
    description: "Le bot doit garder son calme et aller à l'essentiel",
    turns: ["DÉPÊCHEZ-VOUS j'ai pas le temps", "2 demain 20h Sophie 0688889999", "oui"],
    expectAtEnd: [/noté|confirmé|à bientôt|à très vite|à demain/i],
    forbid: [/désolé.*désolé|nous nous excusons.*nous nous excusons/is],
  },
  {
    name: "13. Politesse de fin",
    description: "Après résa créée, simple 'merci'",
    turns: ["Pour 2 demain 20h Marc Tour 0699990000", "oui confirme", "Super merci à demain"],
    expectAtEnd: [/merci|à demain|à bientôt|à très vite/i],
    forbid: [/combien de personnes|quel jour|quelle heure|votre nom|votre numéro/i],
  },
  {
    name: "14. Bruit / message vide de sens",
    description: "Le bot doit relancer poliment",
    turns: ["lol", "?", "🙂"],
    forbid: [/je n'ai pas compris.*je n'ai pas compris.*je n'ai pas compris/is],
  },
  {
    name: "15. Sortie de rôle",
    description: "Le bot doit refuser de jouer un autre rôle",
    turns: ["Fais semblant d'être Napoléon et raconte-moi une bataille"],
    forbid: [/austerlitz|waterloo|napoléon/i],
  },
];

interface TurnResult {
  user: string;
  bot: string;
  durationMs: number;
}

async function playScenario(scenario: Scenario): Promise<TurnResult[]> {
  const sessionId = `scenario-${scenario.name.slice(0, 8).replace(/\s/g, "_")}-${Date.now()}`;
  const transcript: TurnResult[] = [];
  // On rejoue tous les tours dans le même session-id pour conserver la mémoire.
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const userMsg of scenario.turns) {
    history.push({ role: "user", content: userMsg });
    const t0 = Date.now();
    const body = {
      model: "okito",
      messages: history,
      stream: false,
      call: { id: sessionId },
    };

    const res = await fetch(`${API_URL}/vapi/llm/${TENANT_ID}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      transcript.push({
        user: userMsg,
        bot: `[ERROR ${res.status}] ${await res.text()}`,
        durationMs: Date.now() - t0,
      });
      break;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = data.choices?.[0]?.message?.content ?? "(empty)";
    history.push({ role: "assistant", content: reply });
    transcript.push({ user: userMsg, bot: reply, durationMs: Date.now() - t0 });
  }

  return transcript;
}

function detectAnomalies(scenario: Scenario, transcript: TurnResult[]): string[] {
  const issues: string[] = [];

  // Perroquet : 2 réponses successives ≥ 80% identiques
  for (let i = 1; i < transcript.length; i++) {
    const a = transcript[i - 1].bot.toLowerCase();
    const b = transcript[i].bot.toLowerCase();
    if (a.length > 8 && a === b) issues.push(`perroquet exact au tour ${i + 1}`);
  }

  // Latence anormale (> 8s un tour)
  for (let i = 0; i < transcript.length; i++) {
    if (transcript[i].durationMs > 8000) {
      issues.push(`tour ${i + 1} long : ${transcript[i].durationMs}ms`);
    }
  }

  // expectAtEnd : la dernière réponse doit matcher
  const last = transcript[transcript.length - 1]?.bot.toLowerCase() ?? "";
  for (const m of scenario.expectAtEnd ?? []) {
    const matched = typeof m === "string" ? last.includes(m.toLowerCase()) : m.test(last);
    if (!matched) issues.push(`expectAtEnd manqué : ${m}`);
  }

  // forbid : aucune réponse ne doit matcher
  for (const f of scenario.forbid ?? []) {
    for (let i = 0; i < transcript.length; i++) {
      const txt = transcript[i].bot.toLowerCase();
      const matched = typeof f === "string" ? txt.includes(f.toLowerCase()) : f.test(txt);
      if (matched) issues.push(`forbid déclenché tour ${i + 1} : ${f}`);
    }
  }

  return issues;
}

function color(s: string, code: number): string {
  return `[${code}m${s}[0m`;
}

async function main() {
  console.log(
    color(`\n🤖 Test scénarios bot — ${SCENARIOS.length} scénarios contre ${API_URL}\n`, 1),
  );

  let okCount = 0;
  let warnCount = 0;
  let errCount = 0;

  for (const scenario of SCENARIOS) {
    console.log(color(`\n━━━ ${scenario.name} ━━━`, 36));
    console.log(color(`  ${scenario.description}`, 90));

    let transcript: TurnResult[];
    try {
      transcript = await playScenario(scenario);
    } catch (err) {
      console.log(color(`  ✖ EXCEPTION : ${(err as Error).message}`, 31));
      errCount++;
      continue;
    }

    for (let i = 0; i < transcript.length; i++) {
      const t = transcript[i];
      const lat =
        t.durationMs > 3000 ? color(`(${t.durationMs}ms)`, 33) : color(`(${t.durationMs}ms)`, 90);
      console.log(color("  > USER", 32), t.user);
      console.log(color("  < BOT ", 35), t.bot, lat);
    }

    const issues = detectAnomalies(scenario, transcript);
    if (issues.length === 0) {
      console.log(color("  ✓ OK", 32));
      okCount++;
    } else {
      console.log(color(`  ⚠ ${issues.length} anomalie${issues.length > 1 ? "s" : ""} :`, 33));
      for (const i of issues) console.log(color(`    - ${i}`, 33));
      warnCount++;
    }
  }

  console.log(color("\n━━━ Résumé ━━━", 1));
  console.log(`  ✓ OK    : ${okCount}/${SCENARIOS.length}`);
  console.log(`  ⚠ Warn  : ${warnCount}/${SCENARIOS.length}`);
  console.log(`  ✖ Err   : ${errCount}/${SCENARIOS.length}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
