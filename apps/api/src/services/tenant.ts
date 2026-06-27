import {
  DEFAULT_FEATURES,
  type Database,
  type Industry,
  type NewTenant,
  type Tenant,
  type TenantFeatures,
  schema,
} from "@okito/db";
import { desc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

/** Patch admin minimal pour mettre à jour un tenant existant. */
export interface TenantUpdate {
  name?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  timezone?: string;
  industry?: Industry;
  features?: TenantFeatures;
  capacityMax?: number;
  status?: "active" | "suspended" | "trial";
  remindersEnabled?: boolean;
}

export class TenantService {
  constructor(private readonly db: Database) {}

  async getById(id: string): Promise<Tenant> {
    const row = await this.db.query.tenants.findFirst({
      where: (t, { eq: e }) => e(t.id, id),
    });
    if (!row) throw new NotFoundError("Tenant introuvable");
    return row;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const row = await this.db.query.tenants.findFirst({
      where: (t, { eq: e }) => e(t.slug, slug),
    });
    return row ?? null;
  }

  async list(): Promise<Tenant[]> {
    return this.db.query.tenants.findMany({
      orderBy: (t) => [desc(t.createdAt)],
    });
  }

  async create(input: NewTenant): Promise<Tenant> {
    const [row] = await this.db
      .insert(schema.tenants)
      .values({
        ...input,
        features: input.features ?? DEFAULT_FEATURES,
      })
      .returning();
    if (!row) throw new Error("Tenant insert returned no row");
    return row;
  }

  async update(id: string, patch: TenantUpdate): Promise<Tenant> {
    const [row] = await this.db
      .update(schema.tenants)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.tenants.id, id))
      .returning();
    if (!row) throw new NotFoundError("Tenant introuvable");
    return row;
  }

  async setStatus(id: string, status: "active" | "suspended" | "trial"): Promise<Tenant> {
    return this.update(id, { status });
  }
}
