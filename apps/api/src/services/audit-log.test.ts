import type { AuditLog, Database } from "@okito/db";
import { describe, expect, it, vi } from "vitest";
import { AuditLogService } from "./audit-log.js";

function makeDb(insertedRow: Partial<AuditLog> = {}) {
  const returning = vi.fn().mockResolvedValue([{ id: "log-id", ...insertedRow }]);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  return { db: { insert } as unknown as Database, insert, values, returning };
}

describe("AuditLogService.log", () => {
  it("écrit un row avec les champs requis et fallbacks null", async () => {
    const { db, values } = makeDb();
    const svc = new AuditLogService(db);
    await svc.log({
      action: "tenant.create",
      entityType: "tenant",
      entityId: "tenant-id",
      after: { name: "Bistrot" },
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tenant.create",
        entityType: "tenant",
        entityId: "tenant-id",
        actorUserId: null,
        before: null,
        after: { name: "Bistrot" },
        ip: null,
      }),
    );
  });

  it("sérialise des Date en string ISO via sanitize", async () => {
    const { db, values } = makeDb();
    const svc = new AuditLogService(db);
    const date = new Date("2026-06-27T10:00:00.000Z");
    await svc.log({
      action: "tenant.update",
      entityType: "tenant",
      entityId: "x",
      after: { createdAt: date },
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ createdAt: "2026-06-27T10:00:00.000Z" }),
      }),
    );
  });

  it("throw si insert ne retourne aucun row", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const svc = new AuditLogService({ insert } as unknown as Database);
    await expect(
      svc.log({ action: "tenant.create", entityType: "tenant", entityId: "x" }),
    ).rejects.toThrow("audit_log insert returned no row");
  });
});
