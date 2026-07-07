import type { JarvisAction } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import { describe, expect, it, vi } from "vitest";
import type { GoogleBusinessService } from "../google-business.js";
import { GoogleReviewReplyTool } from "./google-review-reply.js";

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

function action(payload: Record<string, unknown>): JarvisAction {
  return {
    id: "action-1",
    tenantId: "tenant-1",
    type: "google.review.reply",
    payload,
  } as unknown as JarvisAction;
}

describe("GoogleReviewReplyTool", () => {
  it("rédige via LLM et publie la réponse sur la fiche", async () => {
    const replyToReview = vi.fn().mockResolvedValue(undefined);
    const gbp = { replyToReview } as unknown as GoogleBusinessService;
    const tool = new GoogleReviewReplyTool(fakeLLM("Merci pour votre retour, à bientôt."), gbp);

    const result = await tool.execute(
      action({
        googleReviewName: "accounts/1/locations/1/reviews/A",
        connectionId: "conn-1",
        rating: 2,
        comment: "Service lent",
      }),
    );

    expect(replyToReview).toHaveBeenCalledWith(
      "conn-1",
      "accounts/1/locations/1/reviews/A",
      "Merci pour votre retour, à bientôt.",
    );
    expect(result).toMatchObject({ published: true });
  });

  it("échoue si le LLM est muet — pas de publication", async () => {
    const replyToReview = vi.fn();
    const gbp = { replyToReview } as unknown as GoogleBusinessService;
    const tool = new GoogleReviewReplyTool(fakeLLM(null), gbp);

    await expect(
      tool.execute(action({ googleReviewName: "r/A", connectionId: "conn-1", rating: 5 })),
    ).rejects.toThrow(/LLM/);
    expect(replyToReview).not.toHaveBeenCalled();
  });

  it("échoue si le payload est incomplet", async () => {
    const gbp = { replyToReview: vi.fn() } as unknown as GoogleBusinessService;
    const tool = new GoogleReviewReplyTool(fakeLLM("texte"), gbp);
    await expect(tool.execute(action({ rating: 3 }))).rejects.toThrow(/googleReviewName/);
  });

  it("propage l'échec de publication Google", async () => {
    const gbp = {
      replyToReview: vi.fn().mockRejectedValue(new Error("reviews.updateReply HTTP 403")),
    } as unknown as GoogleBusinessService;
    const tool = new GoogleReviewReplyTool(fakeLLM("texte"), gbp);
    await expect(
      tool.execute(action({ googleReviewName: "r/A", connectionId: "conn-1", rating: 1 })),
    ).rejects.toThrow(/403/);
  });
});
