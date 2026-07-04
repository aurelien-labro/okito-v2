import { schema } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../../tests/_helpers/pg.js";
import { JarvisActionService } from "../jarvis-action.js";
import { JarvisExecutor } from "../jarvis-executor.js";
import type { NotificationInput, Notifier } from "../notifier.js";
import { ReviewReplyTool } from "./review-reply.js";

function fakeLLM(text: string | null): LLMClient {
  return {
    complete: vi.fn().mockResolvedValue({
      text,
      toolCalls: [],
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  };
}

function fakeNotifier(): Notifier & { sent: NotificationInput[] } {
  const sent: NotificationInput[] = [];
  return {
    sent,
    send: async (input: NotificationInput) => {
      sent.push(input);
      return { delivered: true, provider: "fake" };
    },
    notifyReservationCreated: async () => {},
    notifyReservationCancelled: async () => {},
  };
}

describe("ReviewReplyTool", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let actions: JarvisActionService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-reply", name: "Chez Marcel" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    actions = new JarvisActionService(ctx.db);
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function seedReview(email: string | null) {
    const [resa] = await ctx.db
      .insert(schema.reservations)
      .values({
        tenantId,
        customerName: "Marie Petit",
        customerPhone: "0611111111",
        customerEmail: email,
        couverts: 2,
        dateReservation: "2026-07-01",
        heure: "20:00",
      })
      .returning();
    if (!resa) throw new Error("resa insert failed");
    const [review] = await ctx.db
      .insert(schema.reservationReviews)
      .values({ tenantId, reservationId: resa.id, rating: 2, comment: "Trop d'attente." })
      .returning();
    if (!review) throw new Error("review insert failed");
    return review;
  }

  it("rédige et envoie la réponse par email, action executed avec le texte", async () => {
    const review = await seedReview("marie@test.fr");
    const notifier = fakeNotifier();
    const tool = new ReviewReplyTool(
      ctx.db,
      fakeLLM("Merci Marie, nous sommes désolés."),
      notifier,
    );
    const action = await actions.propose(tenantId, "review.reply", "Répondre à l'avis 2★", {
      reviewId: review.id,
      rating: 2,
    });
    const executor = new JarvisExecutor(ctx.db, actions, [tool]);

    const later = new Date(Date.now() + 25 * 3600_000);
    const result = await executor.runOnce(later);

    expect(result).toMatchObject({ executed: 1, failed: 0 });
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toMatchObject({
      channel: "email",
      to: "marie@test.fr",
      subject: "Votre avis sur Chez Marcel",
    });
    const [executed] = await actions.list(tenantId, "executed");
    expect(executed?.result).toMatchObject({ sentTo: "marie@test.fr" });
    expect(action.id).toBe(executed?.id);
  });

  it("client sans email : action failed avec message explicite", async () => {
    const review = await seedReview(null);
    const notifier = fakeNotifier();
    const tool = new ReviewReplyTool(ctx.db, fakeLLM("Réponse."), notifier);
    await actions.propose(tenantId, "review.reply", "Répondre", { reviewId: review.id });
    const executor = new JarvisExecutor(ctx.db, actions, [tool]);

    const result = await executor.runOnce(new Date(Date.now() + 25 * 3600_000));

    expect(result).toMatchObject({ executed: 0, failed: 1 });
    expect(notifier.sent).toHaveLength(0);
    const [failed] = await actions.list(tenantId, "failed");
    expect(String(failed?.result && (failed.result as { error: string }).error)).toContain(
      "sans email",
    );
  });

  it("avis d'un autre tenant : introuvable, pas d'envoi", async () => {
    const [other] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "autre-resto", name: "Autre" })
      .returning();
    if (!other) throw new Error("tenant insert failed");
    const review = await seedReview("marie@test.fr");
    const notifier = fakeNotifier();
    const tool = new ReviewReplyTool(ctx.db, fakeLLM("Réponse."), notifier);
    const foreignActions = new JarvisActionService(ctx.db);
    await foreignActions.propose(other.id, "review.reply", "Répondre", { reviewId: review.id });
    const executor = new JarvisExecutor(ctx.db, foreignActions, [tool]);

    const result = await executor.runOnce(new Date(Date.now() + 25 * 3600_000));

    expect(result).toMatchObject({ executed: 0, failed: 1 });
    expect(notifier.sent).toHaveLength(0);
  });

  it("LLM muet : action failed, pas d'envoi", async () => {
    const review = await seedReview("marie@test.fr");
    const notifier = fakeNotifier();
    const tool = new ReviewReplyTool(ctx.db, fakeLLM(null), notifier);
    await actions.propose(tenantId, "review.reply", "Répondre", { reviewId: review.id });
    const executor = new JarvisExecutor(ctx.db, actions, [tool]);

    const result = await executor.runOnce(new Date(Date.now() + 25 * 3600_000));

    expect(result).toMatchObject({ executed: 0, failed: 1 });
    expect(notifier.sent).toHaveLength(0);
  });
});
