import {
  type Database,
  type ScheduleRule,
  type ScheduleRuleKind,
  type ScheduleRulePayload,
  schema,
} from "@okito/db";
import { and, asc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export interface CreateRuleInput {
  tenantId: string;
  kind: ScheduleRuleKind;
  payload: ScheduleRulePayload;
}

/**
 * Règles d'ouverture d'un tenant : fermetures hebdo, congés, horaires
 * exceptionnels. Consommées par checkServiceWindow (voir capacity.ts).
 */
export class ScheduleRuleService {
  constructor(private readonly db: Database) {}

  async listByTenant(tenantId: string, includeInactive = false): Promise<ScheduleRule[]> {
    const where = includeInactive
      ? eq(schema.tenantScheduleRules.tenantId, tenantId)
      : and(
          eq(schema.tenantScheduleRules.tenantId, tenantId),
          eq(schema.tenantScheduleRules.active, true),
        );
    return this.db
      .select()
      .from(schema.tenantScheduleRules)
      .where(where)
      .orderBy(asc(schema.tenantScheduleRules.createdAt));
  }

  async create(input: CreateRuleInput): Promise<ScheduleRule> {
    const [row] = await this.db
      .insert(schema.tenantScheduleRules)
      .values({ tenantId: input.tenantId, kind: input.kind, payload: input.payload })
      .returning();
    if (!row) throw new Error("tenant_schedule_rules insert returned no row");
    return row;
  }

  async setActive(id: string, active: boolean): Promise<ScheduleRule> {
    const [row] = await this.db
      .update(schema.tenantScheduleRules)
      .set({ active })
      .where(eq(schema.tenantScheduleRules.id, id))
      .returning();
    if (!row) throw new NotFoundError("Règle introuvable");
    return row;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(schema.tenantScheduleRules).where(eq(schema.tenantScheduleRules.id, id));
  }
}
