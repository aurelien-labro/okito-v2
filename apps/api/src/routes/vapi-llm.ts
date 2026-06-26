import { type Context, Hono } from "hono";
import { BadRequestError, HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { ChatService } from "../services/chat.js";

/**
 * Endpoint OpenAI-compatible que Vapi appelle comme "custom LLM".
 *
 * Vapi configure l'assistant avec model.url = "https://.../v1/vapi-llm/:tenantId"
 * Vapi POSTera ensuite vers "https://.../v1/vapi-llm/:tenantId/chat/completions"
 * avec un body type OpenAI ({ messages, stream, model, ..., call: { id } }).
 *
 * On bypass le system prompt envoyé par Vapi : ChatService injecte le prompt
 * orchestrator OKITO (qui gère mémoire serveur, 1 question/tour, tools).
 *
 * Le tenant vient du path. La sessionKey vient de call.id (Vapi) — persiste
 * à travers tous les tours d'un même appel.
 */

interface OpenAIMessage {
  role: string;
  content: string | null;
}

interface VapiCustomLLMBody {
  model?: string;
  messages?: OpenAIMessage[];
  stream?: boolean;
  call?: { id?: string };
  metadata?: Record<string, unknown>;
}

export function vapiLlmRoute(service: ChatService) {
  const app = new Hono();

  app.post("/:tenantId/chat/completions", async (c) => {
    const tenantId = c.req.param("tenantId");
    if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
      throw new BadRequestError("tenantId invalide dans le path", "invalid_tenant");
    }

    let body: VapiCustomLLMBody;
    try {
      body = (await c.req.json()) as VapiCustomLLMBody;
    } catch {
      throw new BadRequestError("JSON invalide", "invalid_json");
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = typeof lastUser?.content === "string" ? lastUser.content.trim() : "";
    if (!userText) {
      throw new BadRequestError("Aucun message utilisateur dans la requête", "no_user_message");
    }

    const callId =
      typeof body.call?.id === "string" && body.call.id.length > 0
        ? body.call.id
        : `vapi-anon-${Math.random().toString(36).slice(2, 10)}`;
    const sessionKey = `vapi-${callId}`;

    logger.info({ tenantId, sessionKey, userText: userText.slice(0, 80) }, "vapi-llm request");

    let reply: string;
    try {
      const r = await service.handle({
        tenantId,
        channel: "voice",
        sessionKey,
        message: userText,
      });
      reply = r.reply;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      logger.error({ err, tenantId, sessionKey }, "vapi-llm chat handler failed");
      reply = "Désolé, j'ai un petit souci technique. Pouvez-vous répéter ?";
    }

    if (body.stream === true) {
      return streamChatCompletion(c, body.model ?? "okito-orchestrator", reply);
    }

    return c.json({
      id: `chatcmpl-${callId}-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? "okito-orchestrator",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: reply },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  });

  return app;
}

function streamChatCompletion(_c: Context, model: string, reply: string) {
  const id = `chatcmpl-stream-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const emit = (delta: Record<string, unknown>, finish?: string) => {
        const chunk = {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta, finish_reason: finish ?? null }],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      emit({ role: "assistant" });
      // Découpage par phrases courtes : améliore la latence du TTS qui peut commencer à parler.
      const segments = reply.match(/[^.!?…]+[.!?…]?/g) ?? [reply];
      for (const seg of segments) {
        const trimmed = seg.trim();
        if (trimmed) emit({ content: `${trimmed} ` });
      }
      emit({}, "stop");
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
