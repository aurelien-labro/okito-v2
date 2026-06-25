import { type Database, type Tenant, schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

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
}
