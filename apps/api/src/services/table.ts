import { type Database, type TenantTable, schema } from "@okito/db";
import { and, asc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export interface CreateTableInput {
  tenantId: string;
  label: string;
  capacity: number;
}

export interface UpdateTableInput {
  label?: string;
  capacity?: number;
  active?: boolean;
}

/**
 * Service de gestion de l'inventaire de tables d'un tenant.
 *
 * Si un tenant a au moins une table active, la CapacityService passe en
 * mode "table-based" : check_availability cherche une table libre dont la
 * capacité matche la party_size, plutôt que de compter en couverts globaux.
 */
export class TableService {
  constructor(private readonly db: Database) {}

  async listByTenant(tenantId: string, includeInactive = false): Promise<TenantTable[]> {
    const where = includeInactive
      ? eq(schema.tenantTables.tenantId, tenantId)
      : and(eq(schema.tenantTables.tenantId, tenantId), eq(schema.tenantTables.active, true));
    return this.db
      .select()
      .from(schema.tenantTables)
      .where(where)
      .orderBy(asc(schema.tenantTables.capacity), asc(schema.tenantTables.label));
  }

  async create(input: CreateTableInput): Promise<TenantTable> {
    const [row] = await this.db
      .insert(schema.tenantTables)
      .values({
        tenantId: input.tenantId,
        label: input.label.trim(),
        capacity: input.capacity,
      })
      .returning();
    if (!row) throw new Error("tenant_tables insert returned no row");
    return row;
  }

  async update(id: string, patch: UpdateTableInput): Promise<TenantTable> {
    const [row] = await this.db
      .update(schema.tenantTables)
      .set(patch)
      .where(eq(schema.tenantTables.id, id))
      .returning();
    if (!row) throw new NotFoundError("Table introuvable");
    return row;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(schema.tenantTables).where(eq(schema.tenantTables.id, id));
  }
}
