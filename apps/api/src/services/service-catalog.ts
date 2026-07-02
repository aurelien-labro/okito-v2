import { type Database, type ServiceCatalogItem, schema } from "@okito/db";
import { and, asc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export interface CreateServiceInput {
  tenantId: string;
  name: string;
  description?: string | null;
  durationMinutes?: number;
  priceCents?: number | null;
  currency?: string;
  displayOrder?: number;
  customFields?: Record<string, unknown>;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string | null;
  durationMinutes?: number;
  priceCents?: number | null;
  currency?: string;
  active?: boolean;
  displayOrder?: number;
  customFields?: Record<string, unknown>;
}

/**
 * Catalogue de prestations d'un tenant : coupe homme 30 min, vidange 60 min,
 * consultation 20 min… Si un tenant a >0 prestations actives, le bot demande
 * la prestation avant l'heure et snapshot la durée sur la réservation.
 */
export class ServiceCatalogService {
  constructor(private readonly db: Database) {}

  async listByTenant(tenantId: string, includeInactive = false): Promise<ServiceCatalogItem[]> {
    const where = includeInactive
      ? eq(schema.tenantServiceCatalog.tenantId, tenantId)
      : and(
          eq(schema.tenantServiceCatalog.tenantId, tenantId),
          eq(schema.tenantServiceCatalog.active, true),
        );
    return this.db
      .select()
      .from(schema.tenantServiceCatalog)
      .where(where)
      .orderBy(
        asc(schema.tenantServiceCatalog.displayOrder),
        asc(schema.tenantServiceCatalog.name),
      );
  }

  /**
   * Match tolérant par nom (insensible à la casse) pour le bot conversationnel.
   * Priorité : match exact, puis le match partiel le plus spécifique (nom le
   * plus court contenant la demande — évite que "coupe" tombe sur
   * "Coupe + Barbe" quand "Coupe" existe).
   */
  async findByName(tenantId: string, name: string): Promise<ServiceCatalogItem | null> {
    const items = await this.listByTenant(tenantId);
    const needle = name.trim().toLowerCase();
    if (!needle) return null;

    const exact = items.find((i) => i.name.toLowerCase() === needle);
    if (exact) return exact;

    const partial = items
      .filter((i) => {
        const n = i.name.toLowerCase();
        return n.includes(needle) || needle.includes(n);
      })
      .sort((a, b) => a.name.length - b.name.length);
    return partial[0] ?? null;
  }

  async create(input: CreateServiceInput): Promise<ServiceCatalogItem> {
    const [row] = await this.db
      .insert(schema.tenantServiceCatalog)
      .values({
        tenantId: input.tenantId,
        name: input.name.trim(),
        description: input.description ?? null,
        durationMinutes: input.durationMinutes ?? 60,
        priceCents: input.priceCents ?? null,
        currency: input.currency ?? "EUR",
        displayOrder: input.displayOrder ?? 0,
        customFields: input.customFields ?? {},
      })
      .returning();
    if (!row) throw new Error("tenant_service_catalog insert returned no row");
    return row;
  }

  async update(id: string, patch: UpdateServiceInput): Promise<ServiceCatalogItem> {
    const [row] = await this.db
      .update(schema.tenantServiceCatalog)
      .set(patch)
      .where(eq(schema.tenantServiceCatalog.id, id))
      .returning();
    if (!row) throw new NotFoundError("Prestation introuvable");
    return row;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(schema.tenantServiceCatalog).where(eq(schema.tenantServiceCatalog.id, id));
  }
}
