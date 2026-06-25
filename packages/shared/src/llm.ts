/**
 * Abstraction LLM provider-agnostique.
 * Implémentations actuelles : GeminiClient (@okito/api/services/gemini.ts).
 * Permet de basculer Claude/OpenAI plus tard sans toucher au moteur conversationnel.
 */

export type LLMRole = "user" | "model" | "system";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LLMResponse {
  text: string | null;
  toolCalls: LLMToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "safety" | "other";
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMClient {
  complete(request: LLMRequest): Promise<LLMResponse>;
}
