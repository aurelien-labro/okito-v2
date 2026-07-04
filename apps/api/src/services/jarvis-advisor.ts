import { type Database, type Event, schema } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import { and, desc, eq, gte } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { EventBusService } from "./event-bus.js";

export interface JarvisBrief {
  tenantId: string;
  text: string;
  eventCount: number;
  generatedAt: Date;
}

export interface AdvisorRunResult {
  tenantsProcessed: number;
  briefsGenerated: number;
}

const SYSTEM_PROMPT = `Tu es Jarvis, l'assistant de pilotage d'un commerce.
Chaque matin tu écris un brief court pour le patron, à partir du journal
d'événements des dernières 24 heures.

Règles :
- Français, tutoiement, ton direct et concret. 120 mots maximum.
- Commence par l'essentiel : ce qui s'est passé (résas, annulations, no-shows, avis, actions que tu as exécutées).
- Signale ce qui attend une décision du patron (actions en attente de validation).
- Termine par UNE recommandation actionnable si les données le justifient, sinon rien.
- N'invente jamais un chiffre : si le journal est vide, dis-le simplement.`;

/**
 * Advisor Jarvis (fondation V3) : génère le brief matinal de chaque tenant
 * à partir du journal d'événements (event bus, dernières 24 h).
 *
 * Le brief est lui-même publié sur le bus (jarvis.brief.generated) — le
 * dashboard lit le dernier événement de ce type pour afficher la zone
 * "Brief de Jarvis". Pas de table dédiée : le journal EST le stockage.
 */
export class JarvisAdvisorService {
  constructor(
    private readonly db: Database,
    private readonly llm: LLMClient,
    private readonly bus?: EventBusService,
    private readonly windowHours = 24,
  ) {}

  /** Brief pour un tenant. Retourne null si le LLM ne produit rien. */
  async generateBrief(tenantId: string, now = new Date()): Promise<JarvisBrief | null> {
    const since = new Date(now.getTime() - this.windowHours * 3600_000);
    const events = await this.db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.tenantId, tenantId), gte(schema.events.createdAt, since)))
      .orderBy(desc(schema.events.createdAt))
      .limit(200);

    const pendingApprovals = await this.db
      .select()
      .from(schema.jarvisActions)
      .where(
        and(
          eq(schema.jarvisActions.tenantId, tenantId),
          eq(schema.jarvisActions.status, "awaiting_approval"),
        ),
      );

    const response = await this.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildContext(events, pendingApprovals.length) }],
      temperature: 0.3,
      maxOutputTokens: 400,
    });

    const text = response.text?.trim();
    if (!text) {
      logger.warn({ tenantId, finishReason: response.finishReason }, "Jarvis: brief vide");
      return null;
    }

    const brief: JarvisBrief = { tenantId, text, eventCount: events.length, generatedAt: now };
    this.bus?.publish(
      tenantId,
      "jarvis.brief.generated",
      { text, eventCount: events.length, pendingApprovals: pendingApprovals.length },
      "jarvis",
    );
    return brief;
  }

  /** Un passage sur tous les tenants actifs. Appelé par le cron Inngest. */
  async runForAllTenants(now = new Date()): Promise<AdvisorRunResult> {
    const result: AdvisorRunResult = { tenantsProcessed: 0, briefsGenerated: 0 };
    const tenants = await this.db.query.tenants.findMany({
      columns: { id: true },
      where: (t, { eq: whereEq }) => whereEq(t.status, "active"),
    });

    for (const tenant of tenants) {
      result.tenantsProcessed++;
      try {
        const brief = await this.generateBrief(tenant.id, now);
        if (brief) result.briefsGenerated++;
      } catch (err) {
        // Un tenant en échec (quota LLM, etc.) ne bloque pas les autres.
        logger.error({ err, tenantId: tenant.id }, "Jarvis: échec génération brief");
      }
    }
    return result;
  }
}

function buildContext(events: Event[], pendingApprovals: number): string {
  if (events.length === 0 && pendingApprovals === 0) {
    return "Journal des dernières 24 h : aucun événement. Actions en attente de validation : 0.";
  }

  // Agrégat par type : le LLM raisonne mieux sur des comptes que sur 200 lignes brutes.
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const summary = [...counts.entries()].map(([type, n]) => `- ${type} : ${n}`).join("\n");

  const samples = events
    .slice(0, 20)
    .map((e) => `${e.createdAt.toISOString()} ${e.type} ${JSON.stringify(e.payload)}`)
    .join("\n");

  return `Journal des dernières 24 h (${events.length} événements) :
${summary}

Détail des 20 plus récents :
${samples}

Actions en attente de validation du patron : ${pendingApprovals}.`;
}
