import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { TenantAccessService } from "./tenant-access.js";

describe("TenantAccessService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let svc: TenantAccessService;
  let groupId: string;
  let restoAId: string;
  let restoBId: string;
  let autreId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    svc = new TenantAccessService(ctx.db);

    const insert = async (slug: string, name: string, parentTenantId: string | null = null) => {
      const [row] = await ctx.db
        .insert(schema.tenants)
        .values({ slug, name, parentTenantId })
        .returning();
      if (!row) throw new Error("tenant insert failed");
      return row.id;
    };

    groupId = await insert("groupe-paul", "Groupe Paul");
    restoAId = await insert("bistrot-a", "Bistrot A", groupId);
    restoBId = await insert("bistrot-b", "Bistrot B", groupId);
    autreId = await insert("autre-resto", "Autre Resto");
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function addMember(tenantId: string, userId: string, role: "owner" | "manager" | "staff") {
    await ctx.db.insert(schema.tenantMembers).values({ tenantId, userId, role });
  }

  describe("canAccess", () => {
    it("son propre tenant : toujours oui", async () => {
      expect(await svc.canAccess(null, restoAId, restoAId)).toBe(true);
    });

    it("claim = groupe parent → accès aux enfants", async () => {
      expect(await svc.canAccess("user-1", groupId, restoAId)).toBe(true);
      expect(await svc.canAccess("user-1", groupId, restoBId)).toBe(true);
      expect(await svc.canAccess("user-1", groupId, autreId)).toBe(false);
    });

    it("owner membre du groupe → accès aux enfants ; manager/staff non", async () => {
      await addMember(groupId, "owner-1", "owner");
      await addMember(groupId, "manager-1", "manager");
      await addMember(groupId, "staff-1", "staff");

      expect(await svc.canAccess("owner-1", autreId, restoAId)).toBe(true);
      expect(await svc.canAccess("manager-1", null, restoAId)).toBe(false);
      expect(await svc.canAccess("staff-1", null, restoBId)).toBe(false);
    });

    it("membre direct d'un établissement → accès à celui-ci seulement", async () => {
      await addMember(restoAId, "staff-a", "staff");
      expect(await svc.canAccess("staff-a", null, restoAId)).toBe(true);
      expect(await svc.canAccess("staff-a", null, restoBId)).toBe(false);
    });

    it("tenant cible inexistant → non", async () => {
      expect(await svc.canAccess("user-1", groupId, "00000000-0000-0000-0000-000000000000")).toBe(
        false,
      );
    });
  });

  describe("listAccessible", () => {
    it("claim groupe → le groupe + tous ses enfants", async () => {
      const rows = await svc.listAccessible(null, groupId);
      expect(rows.map((t) => t.slug).sort()).toEqual(["bistrot-a", "bistrot-b", "groupe-paul"]);
    });

    it("owner du groupe par membership → groupe + enfants ; staff → son établissement seul", async () => {
      await addMember(groupId, "owner-1", "owner");
      const owner = await svc.listAccessible("owner-1", null);
      expect(owner.map((t) => t.slug).sort()).toEqual(["bistrot-a", "bistrot-b", "groupe-paul"]);

      await addMember(restoAId, "staff-1", "staff");
      const staff = await svc.listAccessible("staff-1", null);
      expect(staff.map((t) => t.slug)).toEqual(["bistrot-a"]);
    });

    it("aucun accès → liste vide", async () => {
      expect(await svc.listAccessible("inconnu", null)).toEqual([]);
    });
  });
});
