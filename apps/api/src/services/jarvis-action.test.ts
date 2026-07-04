import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { EventBusService } from "./event-bus.js";
import { JarvisActionService } from "./jarvis-action.js";

describe("JarvisActionService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let svc: JarvisActionService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-jarvis", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    svc = new JarvisActionService(ctx.db, new EventBusService(ctx.db));
  });

  afterEach(async () => {
    // Draine les inserts fire-and-forget du bus avant de fermer pglite,
    // sinon une promesse en vol ne se résout jamais et vitest ne sort pas.
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  it("policy auto : scheduled immédiatement, sans fenêtre de retrait", async () => {
    const action = await svc.propose(tenantId, "reminder.send", "Rappel résa Dupont");
    expect(action).toMatchObject({ policy: "auto", status: "scheduled", cancellableUntil: null });
    expect(await svc.listExecutable(tenantId)).toHaveLength(1);
  });

  it("policy auto_cancellable : scheduled avec fenêtre, non exécutable avant expiration", async () => {
    const action = await svc.propose(tenantId, "review.reply", "Réponse avis Marie");
    expect(action.status).toBe("scheduled");
    expect(action.cancellableUntil).toBeInstanceOf(Date);

    expect(await svc.listExecutable(tenantId)).toHaveLength(0);
    const after = new Date(Date.now() + 25 * 3600_000);
    expect(await svc.listExecutable(tenantId, after)).toHaveLength(1);
  });

  it("type inconnu : policy approval par défaut, approve la rend exécutable", async () => {
    const action = await svc.propose(tenantId, "tva.declare", "Déclaration TVA juin");
    expect(action).toMatchObject({ policy: "approval", status: "awaiting_approval" });
    expect(await svc.listExecutable(tenantId)).toHaveLength(0);

    const approved = await svc.approve(tenantId, action.id);
    expect(approved.status).toBe("scheduled");
    expect(await svc.listExecutable(tenantId)).toHaveLength(1);
  });

  it("cancel dans la fenêtre de retrait", async () => {
    const action = await svc.propose(tenantId, "review.reply", "Réponse avis");
    const cancelled = await svc.cancel(tenantId, action.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
  });

  it("cancel hors fenêtre : refusé", async () => {
    const shortWindow = new JarvisActionService(ctx.db, undefined, -1);
    const action = await shortWindow.propose(tenantId, "review.reply", "Réponse avis");
    await expect(shortWindow.cancel(tenantId, action.id)).rejects.toThrow(BadRequestError);
  });

  it("cancel d'une action executed : refusé", async () => {
    const action = await svc.propose(tenantId, "reminder.send", "Rappel");
    await svc.markExecuted(tenantId, action.id, { sent: true });
    await expect(svc.cancel(tenantId, action.id)).rejects.toThrow(BadRequestError);
  });

  it("markExecuted / markFailed enregistrent résultat et horodatage", async () => {
    const a = await svc.propose(tenantId, "reminder.send", "Rappel");
    const executed = await svc.markExecuted(tenantId, a.id, { sent: true });
    expect(executed).toMatchObject({ status: "executed", result: { sent: true } });
    expect(executed.executedAt).toBeInstanceOf(Date);

    const b = await svc.propose(tenantId, "reminder.send", "Rappel 2");
    const failed = await svc.markFailed(tenantId, b.id, "SMS provider down");
    expect(failed).toMatchObject({ status: "failed", result: { error: "SMS provider down" } });
  });

  it("isolation tenant : une action d'un autre tenant est introuvable", async () => {
    const [other] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "autre", name: "Autre" })
      .returning();
    if (!other) throw new Error("tenant insert failed");
    const action = await svc.propose(other.id, "reminder.send", "Rappel");

    await expect(svc.cancel(tenantId, action.id)).rejects.toThrow(NotFoundError);
    expect(await svc.list(tenantId)).toHaveLength(0);
  });

  it("chaque transition publie un événement jarvis.* sur le bus", async () => {
    const action = await svc.propose(tenantId, "tva.declare", "TVA");
    await svc.approve(tenantId, action.id);
    await svc.markExecuted(tenantId, action.id);

    const start = Date.now();
    let types: string[] = [];
    while (Date.now() - start < 1000) {
      const rows = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.tenantId, tenantId));
      types = rows.map((r) => r.type);
      if (types.length === 3) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(types.sort()).toEqual([
      "jarvis.action.approved",
      "jarvis.action.executed",
      "jarvis.action.proposed",
    ]);
  });
});
