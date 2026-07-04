import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { JarvisActionService } from "./jarvis-action.js";
import { JarvisExecutor, type JarvisTool } from "./jarvis-executor.js";

describe("JarvisExecutor", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let actions: JarvisActionService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-exec", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    actions = new JarvisActionService(ctx.db);
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  it("exécute les actions scheduled via leur tool et marque executed", async () => {
    const sent: string[] = [];
    const tool: JarvisTool = {
      type: "reminder.send",
      execute: async (a) => {
        sent.push(a.id);
        return { sent: true };
      },
    };
    const action = await actions.propose(tenantId, "reminder.send", "Rappel Dupont");
    const executor = new JarvisExecutor(ctx.db, actions, [tool]);

    const result = await executor.runOnce();

    expect(result).toMatchObject({ tenantsProcessed: 1, executed: 1, failed: 0 });
    expect(sent).toEqual([action.id]);
    const [row] = await actions.list(tenantId, "executed");
    expect(row).toMatchObject({ id: action.id, result: { sent: true } });
  });

  it("respecte la fenêtre de retrait : action auto_cancellable non échue ignorée", async () => {
    const tool: JarvisTool = { type: "review.reply", execute: vi.fn() };
    await actions.propose(tenantId, "review.reply", "Réponse avis");
    const executor = new JarvisExecutor(ctx.db, actions, [tool]);

    const result = await executor.runOnce();
    expect(result).toMatchObject({ executed: 0, failed: 0 });
    expect(tool.execute).not.toHaveBeenCalled();

    const later = new Date(Date.now() + 25 * 3600_000);
    const afterWindow = await executor.runOnce(later);
    expect(afterWindow).toMatchObject({ executed: 1 });
  });

  it("tool qui throw : action failed avec l'erreur, le run continue", async () => {
    const bad: JarvisTool = {
      type: "reminder.send",
      execute: async () => {
        throw new Error("SMS provider down");
      },
    };
    const ok: JarvisTool = { type: "reservation.confirm", execute: async () => ({ ok: true }) };
    await actions.propose(tenantId, "reminder.send", "Rappel");
    await actions.propose(tenantId, "reservation.confirm", "Confirmation");
    const executor = new JarvisExecutor(ctx.db, actions, [bad, ok]);

    const result = await executor.runOnce();

    expect(result).toMatchObject({ executed: 1, failed: 1 });
    const [failed] = await actions.list(tenantId, "failed");
    expect(failed?.result).toEqual({ error: "SMS provider down" });
  });

  it("type sans tool enregistré : failed explicite, jamais ignoré", async () => {
    await actions.propose(tenantId, "reminder.send", "Rappel");
    const executor = new JarvisExecutor(ctx.db, actions);

    const result = await executor.runOnce();

    expect(result).toMatchObject({ executed: 0, failed: 1 });
    const [failed] = await actions.list(tenantId, "failed");
    expect(failed?.result).toEqual({ error: "tool inconnu : reminder.send" });
  });
});
