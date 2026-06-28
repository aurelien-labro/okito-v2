import type { TenantMember } from "@okito/db";
import { describe, expect, it } from "vitest";
import { hasAtLeastRole } from "./tenant-member.js";

function membership(role: TenantMember["role"]): Pick<TenantMember, "role"> {
  return { role };
}

describe("hasAtLeastRole", () => {
  it("staff a au moins staff (oui) mais pas manager (non)", () => {
    expect(hasAtLeastRole(membership("staff"), "staff")).toBe(true);
    expect(hasAtLeastRole(membership("staff"), "manager")).toBe(false);
    expect(hasAtLeastRole(membership("staff"), "owner")).toBe(false);
  });

  it("manager a staff et manager, pas owner", () => {
    expect(hasAtLeastRole(membership("manager"), "staff")).toBe(true);
    expect(hasAtLeastRole(membership("manager"), "manager")).toBe(true);
    expect(hasAtLeastRole(membership("manager"), "owner")).toBe(false);
  });

  it("owner a tous les droits", () => {
    expect(hasAtLeastRole(membership("owner"), "staff")).toBe(true);
    expect(hasAtLeastRole(membership("owner"), "manager")).toBe(true);
    expect(hasAtLeastRole(membership("owner"), "owner")).toBe(true);
  });
});
