import type { Database, Tenant } from "@okito/db";
import { schema } from "@okito/db";
import { eq, inArray } from "drizzle-orm";

/**
 * Résolution d'accès multi-établissements (V3).
 *
 * Règle : chaque utilisateur est cloisonné à son établissement (le tenant de
 * son JWT ou de sa ligne tenant_members) — SAUF les owners d'un tenant
 * « groupe » (parent), qui accèdent à tous les établissements enfants.
 * Manager et staff ne franchissent jamais la frontière de leur établissement.
 */
export class TenantAccessService {
  constructor(private readonly db: Database) {}

  /**
   * L'utilisateur peut-il agir sur `targetTenantId` ?
   * - son propre tenant (claim JWT) : oui
   * - membre direct du tenant cible : oui
   * - owner (membre ou claim) du parent du tenant cible : oui
   */
  async canAccess(
    userId: string | null,
    claimTenantId: string | null,
    targetTenantId: string,
  ): Promise<boolean> {
    if (claimTenantId === targetTenantId) return true;

    const target = await this.db.query.tenants.findFirst({
      where: (t, { eq: e }) => e(t.id, targetTenantId),
      columns: { parentTenantId: true },
    });
    if (!target) return false;

    // Le tenant du JWT est le groupe parent de la cible : le patron dont le
    // compte est rattaché au groupe voit tous ses établissements.
    if (target.parentTenantId && claimTenantId === target.parentTenantId) return true;

    if (!userId) return false;

    const memberships = await this.db
      .select({ tenantId: schema.tenantMembers.tenantId, role: schema.tenantMembers.role })
      .from(schema.tenantMembers)
      .where(eq(schema.tenantMembers.userId, userId));

    for (const m of memberships) {
      if (m.tenantId === targetTenantId) return true;
      if (m.role === "owner" && target.parentTenantId && m.tenantId === target.parentTenantId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Tenants accessibles pour le switcher du dashboard : le tenant du claim,
   * les memberships directs, et — pour chaque groupe où l'utilisateur est
   * owner (ou dont le claim est le groupe) — tous les établissements enfants.
   */
  async listAccessible(userId: string | null, claimTenantId: string | null): Promise<Tenant[]> {
    const directIds = new Set<string>();
    const ownerGroupIds = new Set<string>();

    if (claimTenantId) {
      directIds.add(claimTenantId);
      // Le claim lui-même peut être un groupe : le patron voit ses enfants.
      ownerGroupIds.add(claimTenantId);
    }

    if (userId) {
      const memberships = await this.db
        .select({ tenantId: schema.tenantMembers.tenantId, role: schema.tenantMembers.role })
        .from(schema.tenantMembers)
        .where(eq(schema.tenantMembers.userId, userId));
      for (const m of memberships) {
        directIds.add(m.tenantId);
        if (m.role === "owner") ownerGroupIds.add(m.tenantId);
      }
    }

    if (directIds.size === 0) return [];

    const ids = [...directIds];
    const rows = await this.db.select().from(schema.tenants).where(inArray(schema.tenants.id, ids));

    const children = ownerGroupIds.size
      ? await this.db
          .select()
          .from(schema.tenants)
          .where(inArray(schema.tenants.parentTenantId, [...ownerGroupIds]))
      : [];

    const byId = new Map<string, Tenant>();
    for (const t of [...rows, ...children]) byId.set(t.id, t);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }
}
