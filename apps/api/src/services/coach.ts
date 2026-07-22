import { type Database, type Event, schema } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger.js";

/**
 * Skill Coach (v1) : construit le plan de journée du patron.
 *
 * Se pose au-dessus de l'Advisor : là où l'Advisor rédige un brief narratif,
 * le Coach retourne des priorités structurées + un nudge de terrain (rule-based)
 * pour que le dashboard puisse les afficher en cases actionnables.
 *
 * v1 : pas de cron, pas de persistance dédiée (les priorités sont recalculées
 * à la demande depuis le journal d'événements — même stockage que le brief).
 * L'ajout du cron 8 h et du débrief soir 19 h viendra dans une PR suivante.
 */

const LLM_SYSTEM_PROMPT = `Tu es Coach, un rôle spécialisé de Jarvis pour un commerce français.
À partir du journal d'événements des dernières 24 h et de la liste des actions
en attente, produis TROIS priorités concrètes pour le patron aujourd'hui.

Règles :
- Réponds UNIQUEMENT avec un objet JSON strict, sans texte autour, sans balises markdown.
- Format : {"priorities":[{"text": string, "why": string}, ...]} avec exactement 3 entrées.
- text : ce qu'il doit faire, une phrase impérative, 60 caractères max, tutoiement.
- why : la raison ancrée dans le journal (chiffre ou événement précis), 100 caractères max.
- Si le journal ne justifie pas 3 priorités, complète avec des priorités hebdomadaires génériques
  clairement libellées ("Cette semaine : ...").
- N'invente aucun chiffre. Si un why n'est pas ancrable, écris "Journal vide sur ce point".`;

const prioritySchema = z.object({
  text: z.string().min(1).max(120),
  why: z.string().min(1).max(200),
});

const llmResponseSchema = z.object({
  priorities: z.array(prioritySchema).length(3),
});

export interface CoachPlan {
  tenantId: string;
  priorities: Array<{ text: string; why: string }>;
  nudge: CoachNudge | null;
  eventCount: number;
  pendingApprovals: number;
  generatedAt: Date;
}

export interface CoachNudge {
  /** Libellé impératif court affiché en haut du plan. */
  label: string;
  /** true = action bloquante à faire tout de suite (rouge côté UI). */
  urgent: boolean;
}

export class CoachService {
  constructor(
    private readonly db: Database,
    private readonly llm: LLMClient,
    private readonly windowHours = 24,
  ) {}

  async plan(tenantId: string, now = new Date()): Promise<CoachPlan | null> {
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

    const overdueInvoices = await this.countOverdueInvoices(tenantId, now);

    const response = await this.llm.complete({
      system: LLM_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildContext(events, pendingApprovals.length, overdueInvoices),
        },
      ],
      temperature: 0.2,
      maxOutputTokens: 400,
    });

    const priorities = parsePriorities(response.text, tenantId);
    if (!priorities) return null;

    return {
      tenantId,
      priorities,
      nudge: computeNudge(pendingApprovals.length, overdueInvoices),
      eventCount: events.length,
      pendingApprovals: pendingApprovals.length,
      generatedAt: now,
    };
  }

  private async countOverdueInvoices(tenantId: string, now: Date): Promise<number> {
    // La table peut ne pas exister sur les tenants qui n'ont pas activé les factures
    // (les migrations sont conditionnelles côté prod historiquement). En cas d'erreur
    // on renvoie 0 : le plan n'est pas bloquant pour un signal ancillaire.
    try {
      const rows = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.tenantId, tenantId),
            eq(schema.invoices.status, "sent"),
            lte(schema.invoices.dueDate, now),
          ),
        );
      return rows[0]?.n ?? 0;
    } catch (err) {
      logger.warn({ err, tenantId }, "Coach: comptage factures en retard indisponible");
      return 0;
    }
  }
}

function parsePriorities(
  raw: string | null | undefined,
  tenantId: string,
): CoachPlan["priorities"] | null {
  const text = raw?.trim();
  if (!text) {
    logger.warn({ tenantId }, "Coach: LLM muet");
    return null;
  }
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    logger.warn({ tenantId, raw: stripped.slice(0, 200) }, "Coach: JSON invalide");
    return null;
  }
  const result = llmResponseSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn({ tenantId, issues: result.error.issues }, "Coach: schema invalide");
    return null;
  }
  return result.data.priorities;
}

function computeNudge(pendingApprovals: number, overdueInvoices: number): CoachNudge | null {
  if (pendingApprovals >= 3) {
    return { label: `${pendingApprovals} actions attendent ta validation`, urgent: true };
  }
  if (overdueInvoices >= 1) {
    return {
      label: `${overdueInvoices} facture${overdueInvoices > 1 ? "s" : ""} en retard à relancer`,
      urgent: overdueInvoices >= 3,
    };
  }
  if (pendingApprovals >= 1) {
    return {
      label: `${pendingApprovals} action${pendingApprovals > 1 ? "s" : ""} à valider`,
      urgent: false,
    };
  }
  return null;
}

function buildContext(events: Event[], pendingApprovals: number, overdueInvoices: number): string {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const summary =
    counts.size === 0
      ? "aucun événement"
      : [...counts.entries()].map(([type, n]) => `- ${type} : ${n}`).join("\n");
  const samples = events
    .slice(0, 12)
    .map((e) => `${e.createdAt.toISOString()} ${e.type} ${JSON.stringify(e.payload)}`)
    .join("\n");
  return `Journal des dernières 24 h (${events.length} événements) :
${summary}

Détail des 12 plus récents :
${samples || "(vide)"}

Signaux hors journal :
- Actions Jarvis en attente de validation : ${pendingApprovals}
- Factures clients en retard : ${overdueInvoices}`;
}
