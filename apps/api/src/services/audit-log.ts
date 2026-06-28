import { type AuditLog, type Database, type NewAuditLog, schema } from "@okito/db";
import { and, desc, eq } from "drizzle-orm";

/**
 * Sérialise des Date imbriquées en string ISO pour rester valide JSON.
 * On utilise JSON.stringify+parse car les valeurs sont déjà petites
 * (un row tenant ou reservation, pas un blob).
 */
function sanitize(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

export interface LogInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  tenantId?: string | null;
  actorUserId?: string | null;
  actorLabel?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export interface ListFilters {
  tenantId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export class AuditLogService {
  constructor(private readonly db: Database) {}

  async log(input: LogInput): Promise<AuditLog> {
    const row: NewAuditLog = {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      tenantId: input.tenantId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel ?? null,
      before: sanitize(input.before),
      after: sanitize(input.after),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    };
    const [inserted] = await this.db.insert(schema.auditLog).values(row).returning();
    if (!inserted) throw new Error("audit_log insert returned no row");
    return inserted;
  }

  async list(filters: ListFilters = {}): Promise<AuditLog[]> {
    const conditions = [];
    if (filters.tenantId) conditions.push(eq(schema.auditLog.tenantId, filters.tenantId));
    if (filters.entityType) conditions.push(eq(schema.auditLog.entityType, filters.entityType));
    if (filters.entityId) conditions.push(eq(schema.auditLog.entityId, filters.entityId));

    const limit = Math.min(filters.limit ?? 100, 500);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return this.db
      .select()
      .from(schema.auditLog)
      .where(where)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(limit);
  }
}
