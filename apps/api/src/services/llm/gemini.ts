import { type FunctionCall, type FunctionDeclaration, GoogleGenAI } from "@google/genai";
import type {
  LLMClient,
  LLMMessage,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
  LLMToolDefinition,
} from "@okito/shared/llm";
import { isRetryableLLMError, withRetry } from "./retry.js";

export interface GeminiClientOptions {
  apiKey: string;
  defaultModel: string;
  fallbackModel: string;
  timeoutMs: number;
  retryMax: number;
  onRetry?: (err: unknown, attempt: number, delayMs: number, model: string) => void;
  onFallback?: (err: unknown, from: string, to: string) => void;
}

export class GeminiClient implements LLMClient {
  private readonly ai: GoogleGenAI;

  constructor(private readonly opts: GeminiClientOptions) {
    this.ai = new GoogleGenAI({ apiKey: opts.apiKey });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const primaryModel = request.model ?? this.opts.defaultModel;

    try {
      return await withRetry(() => this.generate(primaryModel, request), {
        maxAttempts: Math.max(1, this.opts.retryMax),
        baseDelayMs: 1000,
        onRetry: (err, attempt, delay) => this.opts.onRetry?.(err, attempt, delay, primaryModel),
      });
    } catch (err) {
      const canFallback = primaryModel !== this.opts.fallbackModel && isRetryableLLMError(err);
      if (canFallback) {
        this.opts.onFallback?.(err, primaryModel, this.opts.fallbackModel);
        return await this.generate(this.opts.fallbackModel, request);
      }
      throw err;
    }
  }

  private async generate(model: string, request: LLMRequest): Promise<LLMResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: mapMessages(request.messages),
        config: {
          systemInstruction: request.system,
          tools: request.tools ? [{ functionDeclarations: request.tools.map(mapTool) }] : undefined,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          abortSignal: controller.signal,
        },
      });
      return parseResponse(response);
    } finally {
      clearTimeout(timer);
    }
  }
}

function mapMessages(messages: LLMMessage[]): { role: string; parts: { text: string }[] }[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));
}

function mapTool(t: LLMToolDefinition): FunctionDeclaration {
  return {
    name: t.name,
    description: t.description,
    parameters: t.parameters as FunctionDeclaration["parameters"],
  };
}

interface RawResponse {
  text?: string;
  functionCalls?: FunctionCall[];
  candidates?: Array<{ finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function parseResponse(raw: RawResponse): LLMResponse {
  const toolCalls: LLMToolCall[] = (raw.functionCalls ?? []).map((fc) => ({
    name: fc.name ?? "",
    arguments: (fc.args ?? {}) as Record<string, unknown>,
  }));

  const rawReason = raw.candidates?.[0]?.finishReason;
  const finishReason: LLMResponse["finishReason"] =
    toolCalls.length > 0 ? "tool_calls" : mapFinishReason(rawReason);

  return {
    text: raw.text ?? null,
    toolCalls,
    finishReason,
    usage: {
      promptTokens: raw.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: raw.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

function mapFinishReason(raw: string | undefined): LLMResponse["finishReason"] {
  switch (raw) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
      return "safety";
    default:
      return "other";
  }
}
