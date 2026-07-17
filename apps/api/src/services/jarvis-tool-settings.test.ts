import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { JarvisActionService } from "./jarvis-action.js";
import { JarvisExecutor, type JarvisTool } from "./jarvis-executor.js";
import { JarvisObserverService } from "./jarvis-observer.js";
import { JARVIS_TOOL_CATALOG, JarvisToolSettingsService } from "./jarvis-tool-settings.js";

describe("JarvisToolSettingsService", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let settings: JarvisToolSettingsService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-boutique", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    settings = new JarvisToolSettingsService(ctx.db);
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  it("list : catalogue complet, tout actif par défaut, sans ligne en base", async () => {
    const tools = await settings.list(tenantId);
    expect(tools).toHaveLength(JARVIS_TOOL_CATALOG.length);
    for (const tool of tools) {
      expect(tool).toMatchObject({ enabled: true, policyOverride: null });
    }
  });

  it("setEnabled(false) puis re-list : le tool apparaît désactivé", async () => {
    await settings.setEnabled(tenantId, "review.reply", false);
    const tools = await settings.list(tenantId);
    expect(tools.find((t) => t.type === "review.reply")).toMatchObject({ enabled: false });
    expect(await settings.isEnabled(tenantId, "review.reply")).toBe(false);
    // Réactivation : upsert sur la même ligne.
    await settings.setEnabled(tenantId, "review.reply", true);
    expect(await settings.isEnabled(tenantId, "review.reply")).toBe(true);
  });

  it("un type hors catalogue n'est pas réglable mais reste actif", async () => {
    await expect(settings.setEnabled(tenantId, "tva.declare", false)).rejects.toThrow(
      "Tool inconnu",
    );
    expect(await settings.isEnabled(tenantId, "tva.declare")).toBe(true);
  });

  it("policyOverride force la policy à la proposition", async () => {
    await settings.setPolicyOverride(tenantId, "review.reply", "approval");
    const actions = new JarvisActionService(ctx.db, undefined, undefined, undefined, settings);
    const action = await actions.propose(tenantId, "review.reply", "Réponse avis");
    expect(action).toMatchObject({ policy: "approval", status: "awaiting_approval" });
    // Retour au défaut du code une fois l'override levé.
    await settings.setPolicyOverride(tenantId, "review.reply", null);
    const again = await actions.propose(tenantId, "review.reply", "Réponse avis 2");
    expect(again).toMatchObject({ policy: "auto_cancellable", status: "scheduled" });
  });

  it("Observer : un tool désactivé n'est plus proposé", async () => {
    await settings.setEnabled(tenantId, "review.reply", false);
    const actions = new JarvisActionService(ctx.db);
    const observer = new JarvisObserverService(ctx.db, actions, 2, undefined, settings);
    await ctx.db.insert(schema.events).values({
      tenantId,
      type: "review.submitted",
      payload: { reviewId: "11111111-1111-1111-1111-111111111111", rating: 1 },
    });

    const result = await observer.runOnce();

    expect(result.actionsProposed).toBe(0);
    expect(await actions.list(tenantId)).toHaveLength(0);
  });

  it("Executor : une action dont le tool a été désactivé entre-temps est retirée", async () => {
    const tool: JarvisTool = { type: "review.reply", execute: vi.fn() };
    const actions = new JarvisActionService(ctx.db);
    const action = await actions.propose(tenantId, "review.reply", "Réponse avis");
    await settings.setEnabled(tenantId, "review.reply", false);
    const executor = new JarvisExecutor(ctx.db, actions, [tool], settings);

    const later = new Date(Date.now() + 25 * 3600_000);
    const result = await executor.runOnce(later);

    expect(result).toMatchObject({ executed: 0, failed: 0, skipped: 1 });
    expect(tool.execute).not.toHaveBeenCalled();
    const [cancelled] = await actions.list(tenantId, "cancelled");
    expect(cancelled?.id).toBe(action.id);
  });
});
