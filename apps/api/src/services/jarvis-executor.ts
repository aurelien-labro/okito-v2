import type { Database, JarvisAction } from "@okito/db";
import { logger } from "../lib/logger.js";
import type { JarvisActionService } from "./jarvis-action.js";

/**
 * Un tool exécutable par Jarvis : une action = un tool typé, qui appelle un
 * service métier existant. Le contrat du payload est propre à chaque type.
 */
export interface JarvisTool {
  /** Type d'action pris en charge ("review.reply", "invoice.remind"…). */
  type: string;
  execute(action: JarvisAction): Promise<Record<string, unknown>>;
}

export interface JarvisExecutorRunResult {
  tenantsProcessed: number;
  executed: number;
  failed: number;
}

/**
 * Executor Jarvis (fondation V3) : consomme les actions exécutables
 * (scheduled + fenêtre de retrait écoulée) et les route vers leur tool.
 *
 * Chaque action est isolée : un tool qui échoue marque l'action failed
 * (avec l'erreur en result) sans interrompre le run. Un type sans tool
 * enregistré est marqué failed — jamais silencieusement ignoré.
 */
export class JarvisExecutor {
  private readonly tools: Map<string, JarvisTool>;

  constructor(
    private readonly db: Database,
    private readonly actions: JarvisActionService,
    tools: JarvisTool[] = [],
  ) {
    this.tools = new Map(tools.map((t) => [t.type, t]));
  }

  registerTool(tool: JarvisTool): void {
    this.tools.set(tool.type, tool);
  }

  /** Un passage complet sur tous les tenants. Appelé par le cron Inngest. */
  async runOnce(now = new Date()): Promise<JarvisExecutorRunResult> {
    const result: JarvisExecutorRunResult = { tenantsProcessed: 0, executed: 0, failed: 0 };

    const tenants = await this.db.query.tenants.findMany({ columns: { id: true } });
    for (const tenant of tenants) {
      const executable = await this.actions.listExecutable(tenant.id, now);
      if (executable.length > 0) result.tenantsProcessed++;

      for (const action of executable) {
        const outcome = await this.executeOne(action);
        result[outcome]++;
      }
    }
    return result;
  }

  private async executeOne(action: JarvisAction): Promise<"executed" | "failed"> {
    const tool = this.tools.get(action.type);
    if (!tool) {
      await this.actions.markFailed(action.tenantId, action.id, `tool inconnu : ${action.type}`);
      logger.warn({ actionId: action.id, type: action.type }, "Jarvis: tool inconnu");
      return "failed";
    }
    try {
      const output = await tool.execute(action);
      await this.actions.markExecuted(action.tenantId, action.id, output);
      return "executed";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.actions.markFailed(action.tenantId, action.id, message);
      logger.error({ err, actionId: action.id, type: action.type }, "Jarvis: exécution échouée");
      return "failed";
    }
  }
}
