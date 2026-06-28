import { type Database, type TenantMember, type TenantMemberRole, schema } from "@okito/db";
import { and, desc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

/**
 * Gestion des membres d'un tenant — invite, list, change role, remove.
 *
 * Workflow d'invitation :
 *   invite() → insert { invited_email, invited_at, role, user_id: null }
 *   acceptInvite() → (appelé après signup Supabase) match l'email,
 *                    set user_id + accepted_at
 *
 * Hiérarchie des rôles : owner > manager > staff. Voir hasAtLeastRole().
 */

const ROLE_RANK: Record<TenantMemberRole, number> = {
  staff: 1,
  manager: 2,
  owner: 3,
};

export function hasAtLeastRole(
  membership: Pick<TenantMember, "role">,
  required: TenantMemberRole,
): boolean {
  return ROLE_RANK[membership.role as TenantMemberRole] >= ROLE_RANK[required];
}

export interface InviteInput {
  tenantId: string;
  email: string;
  role: TenantMemberRole;
}

export class TenantMemberService {
  constructor(private readonly db: Database) {}

  async listByTenant(tenantId: string): Promise<TenantMember[]> {
    return this.db
      .select()
      .from(schema.tenantMembers)
      .where(eq(schema.tenantMembers.tenantId, tenantId))
      .orderBy(desc(schema.tenantMembers.createdAt));
  }

  async listByUser(userId: string): Promise<TenantMember[]> {
    return this.db
      .select()
      .from(schema.tenantMembers)
      .where(eq(schema.tenantMembers.userId, userId))
      .orderBy(desc(schema.tenantMembers.createdAt));
  }

  async findMembership(tenantId: string, userId: string): Promise<TenantMember | null> {
    const row = await this.db.query.tenantMembers.findFirst({
      where: (m, { and: a, eq: e }) => a(e(m.tenantId, tenantId), e(m.userId, userId)),
    });
    return row ?? null;
  }

  async invite(input: InviteInput): Promise<TenantMember> {
    const [row] = await this.db
      .insert(schema.tenantMembers)
      .values({
        tenantId: input.tenantId,
        invitedEmail: input.email.toLowerCase().trim(),
        role: input.role,
        invitedAt: new Date(),
      })
      .returning();
    if (!row) throw new Error("tenant_members insert returned no row");
    return row;
  }

  /** Appelé après signup Supabase Auth quand l'invité crée son compte. */
  async acceptInvite(args: {
    tenantId: string;
    email: string;
    userId: string;
  }): Promise<TenantMember> {
    const [row] = await this.db
      .update(schema.tenantMembers)
      .set({ userId: args.userId, acceptedAt: new Date() })
      .where(
        and(
          eq(schema.tenantMembers.tenantId, args.tenantId),
          eq(schema.tenantMembers.invitedEmail, args.email.toLowerCase().trim()),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError("Invitation introuvable pour cet email");
    return row;
  }

  async updateRole(args: { memberId: string; role: TenantMemberRole }): Promise<TenantMember> {
    const [row] = await this.db
      .update(schema.tenantMembers)
      .set({ role: args.role })
      .where(eq(schema.tenantMembers.id, args.memberId))
      .returning();
    if (!row) throw new NotFoundError("Membre introuvable");
    return row;
  }

  async remove(memberId: string): Promise<void> {
    await this.db.delete(schema.tenantMembers).where(eq(schema.tenantMembers.id, memberId));
  }
}
