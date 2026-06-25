import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGenerate, mockCtor } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockCtor: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: mockCtor.mockImplementation(() => ({
    models: { generateContent: mockGenerate },
  })),
}));

import { GeminiClient } from "./gemini.js";

afterEach(() => {
  mockGenerate.mockReset();
  mockCtor.mockClear();
});

const baseOpts = {
  apiKey: "test-key",
  defaultModel: "gemini-2.5-flash",
  fallbackModel: "gemini-2.5-pro",
  timeoutMs: 1000,
  retryMax: 1,
};

describe("GeminiClient", () => {
  it("mappe la requête vers le format Gemini", async () => {
    mockGenerate.mockResolvedValueOnce({
      text: "Bonjour",
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    });

    const client = new GeminiClient(baseOpts);
    await client.complete({
      system: "Tu es l'assistant.",
      messages: [
        { role: "user", content: "Salut" },
        { role: "model", content: "Bonjour, je peux vous aider ?" },
        { role: "user", content: "Une réservation" },
      ],
      tools: [
        {
          name: "create_reservation",
          description: "Crée une résa",
          parameters: { type: "object", properties: {} },
        },
      ],
      temperature: 0.5,
      maxOutputTokens: 256,
    });

    expect(mockGenerate).toHaveBeenCalledOnce();
    const args = mockGenerate.mock.calls[0]?.[0];
    expect(args).toBeDefined();
    expect(args.model).toBe("gemini-2.5-flash");
    expect(args.contents).toEqual([
      { role: "user", parts: [{ text: "Salut" }] },
      { role: "model", parts: [{ text: "Bonjour, je peux vous aider ?" }] },
      { role: "user", parts: [{ text: "Une réservation" }] },
    ]);
    expect(args.config.systemInstruction).toBe("Tu es l'assistant.");
    expect(args.config.temperature).toBe(0.5);
    expect(args.config.maxOutputTokens).toBe(256);
    expect(args.config.tools).toHaveLength(1);
    expect(args.config.tools[0].functionDeclarations[0].name).toBe("create_reservation");
  });

  it("parse une réponse texte sans tool call", async () => {
    mockGenerate.mockResolvedValueOnce({
      text: "Bien noté, à demain 20h.",
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 11 },
    });

    const client = new GeminiClient(baseOpts);
    const resp = await client.complete({
      system: "x",
      messages: [{ role: "user", content: "ok" }],
    });

    expect(resp.text).toBe("Bien noté, à demain 20h.");
    expect(resp.toolCalls).toEqual([]);
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage).toEqual({ promptTokens: 42, completionTokens: 11 });
  });

  it("parse les tool calls et force finishReason=tool_calls", async () => {
    mockGenerate.mockResolvedValueOnce({
      text: undefined,
      functionCalls: [
        {
          name: "create_reservation",
          args: { customerName: "Jean", couverts: 4 },
        },
      ],
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 8 },
    });

    const client = new GeminiClient(baseOpts);
    const resp = await client.complete({ system: "x", messages: [{ role: "user", content: "y" }] });

    expect(resp.toolCalls).toEqual([
      { name: "create_reservation", arguments: { customerName: "Jean", couverts: 4 } },
    ]);
    expect(resp.finishReason).toBe("tool_calls");
    expect(resp.text).toBeNull();
  });

  it("bascule sur le fallback si le primaire échoue avec retryable", async () => {
    const onFallback = vi.fn();
    mockGenerate.mockRejectedValueOnce({ status: 503, message: "down" }).mockResolvedValueOnce({
      text: "fallback ok",
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: {},
    });

    const client = new GeminiClient({ ...baseOpts, onFallback });
    const resp = await client.complete({ system: "x", messages: [{ role: "user", content: "z" }] });

    expect(resp.text).toBe("fallback ok");
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(mockGenerate.mock.calls[0]?.[0].model).toBe("gemini-2.5-flash");
    expect(mockGenerate.mock.calls[1]?.[0].model).toBe("gemini-2.5-pro");
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("propage l'erreur si le fallback échoue aussi", async () => {
    mockGenerate.mockRejectedValue({ status: 500, message: "kaboom" });

    const client = new GeminiClient(baseOpts);
    await expect(
      client.complete({ system: "x", messages: [{ role: "user", content: "z" }] }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("ne tente pas de fallback sur erreur non récupérable", async () => {
    mockGenerate.mockRejectedValueOnce({ status: 400, message: "bad request" });

    const client = new GeminiClient(baseOpts);
    await expect(
      client.complete({ system: "x", messages: [{ role: "user", content: "z" }] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});
