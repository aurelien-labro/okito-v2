import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Membres d'un tenant — qui peut accéder à quel restaurant/hôtel/etc.,
 * avec quel rôle.
 *
 * - owner   : tous droits, peut gérer les membres
 * - manager : config + stats + résa, pas de gestion membres
 * - staff   : lecture/écriture résa uniquement
 *
 * Invitation : ligne créée avec invited_email (sans user_id). Quand
 * l'invité signup avec cet email, un job de sync (PR future) match
 * et set user_id + accepted_at.
 */
export const TENANT_MEMBER_ROLES = ["owner", "manager", "staff"] as const;
export type TenantMemberRole = (typeof TENANT_MEMBER_ROLES)[number];

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Sub Supabase Auth — null tant que l'invité n'a pas signup. */
    userId: text("user_id"),
    invitedEmail: text("invited_email"),

    role: text("role", { enum: TENANT_MEMBER_ROLES }).notNull(),

    invitedAt: timestamp("invited_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tenant_members_user_idx").on(t.userId),
    index("tenant_members_tenant_idx").on(t.tenantId),
    unique("tenant_members_user_uniq").on(t.tenantId, t.userId),
    unique("tenant_members_email_uniq").on(t.tenantId, t.invitedEmail),
  ],
);

export type TenantMember = typeof tenantMembers.$inferSelect;
export type NewTenantMember = typeof tenantMembers.$inferInsert;
