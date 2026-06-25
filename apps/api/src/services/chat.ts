import type { Conversation, ConversationMessage, Tenant } from "@okito/db";
import { ORCHESTRATOR_TOOLS, buildOrchestratorPrompt } from "@okito/prompts";
import type { LLMClient, LLMToolCall } from "@okito/shared/llm";
import { type ChatRequest, type ChatResponse, reservationCoreSchema } from "@okito/shared/types";
import { logger } from "../lib/logger.js";
import type { CapacityService } from "./capacity.js";
import type { ConversationService } from "./conversation.js";
import { DuplicateReservationError, type ReservationService } from "./reservation.js";
import type { TenantService } from "./tenant.js";

const MAX_HISTORY_MESSAGES = 20;

export interface ChatDeps {
  llm: LLMClient;
  conversation: ConversationService;
  reservation: ReservationService;
  tenant: TenantService;
  capacity?: CapacityService;
}

interface ToolOutcome {
  reply: string;
  status: ChatResponse["status"];
  reservationId?: string;
}

export class ChatService {
  constructor(private readonly deps: ChatDeps) {}

  async handle(input: ChatRequest): Promise<ChatResponse> {
    const tenant = await this.deps.tenant.getById(input.tenantId);
    const conv = await this.deps.conversation.findOrCreate({
      tenantId: input.tenantId,
      channel: input.channel,
      sessionKey: input.sessionKey,
    });

    const convAfterUser = await this.deps.conversation.appendMessage(conv.id, input.tenantId, {
      role: "user",
      content: input.message,
      at: new Date().toISOString(),
    });

    const llmMessages = convAfterUser.messages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));

    const llmChannel =
      input.channel === "web_widget" ? "web" : input.channel === "manual" ? "web" : input.channel;

    const llmResponse = await this.deps.llm.complete({
      system: buildOrchestratorPrompt({
        restaurantName: tenant.name,
        timezone: tenant.timezone,
        todayIso: new Date().toISOString().slice(0, 10),
        channel: llmChannel,
      }),
      messages: llmMessages,
      tools: ORCHESTRATOR_TOOLS,
      temperature: 0.3,
      maxOutputTokens: 512,
    });

    const outcome: ToolOutcome = llmResponse.toolCalls[0]
      ? await this.executeTool(llmResponse.toolCalls[0], tenant, input.channel)
      : {
          reply: llmResponse.text?.trim() ?? "Désolé, je n'ai pas compris.",
          status: "in_progress",
        };

    await this.deps.conversation.appendMessage(conv.id, input.tenantId, {
      role: "model",
      content: outcome.reply,
      at: new Date().toISOString(),
    });

    if (outcome.status !== "in_progress") {
      await this.deps.conversation.setStatus(
        conv.id,
        input.tenantId,
        outcome.status === "error" ? "abandoned" : "completed",
        { reservationId: outcome.reservationId, step: "completed" },
      );
    }

    return {
      reply: outcome.reply,
      conversationId: conv.id,
      status: outcome.status,
    };
  }

  private async executeTool(
    toolCall: LLMToolCall,
    tenant: Tenant,
    channel: ChatRequest["channel"],
  ): Promise<ToolOutcome> {
    switch (toolCall.name) {
      case "create_reservation":
        return this.handleCreate(toolCall.arguments, tenant.id, channel);
      case "cancel_reservation":
        return this.handleCancel(toolCall.arguments, tenant.id);
      case "ask_field":
        return this.handleAskField(toolCall.arguments);
      case "check_availability":
        return this.handleCheckAvailability(toolCall.arguments, tenant);
      default:
        logger.warn({ toolName: toolCall.name }, "tool inconnu retourné par le LLM");
        return { reply: "Désolé, je n'ai pas pu traiter cette action.", status: "error" };
    }
  }

  private async handleCheckAvailability(
    rawArgs: Record<string, unknown>,
    tenant: Tenant,
  ): Promise<ToolOutcome> {
    if (!this.deps.capacity) {
      return {
        reply: "Je n'arrive pas à vérifier la disponibilité pour le moment.",
        status: "in_progress",
      };
    }

    const date = typeof rawArgs.date === "string" ? rawArgs.date : null;
    const time = typeof rawArgs.time === "string" ? rawArgs.time : null;
    const couverts = typeof rawArgs.partySize === "number" ? rawArgs.partySize : null;

    if (!date || !time || !couverts) {
      return {
        reply: "Pour vérifier, il me faut la date, l'heure et le nombre de personnes.",
        status: "in_progress",
      };
    }

    const check = await this.deps.capacity.check({
      tenantId: tenant.id,
      date,
      heure: time,
      couverts,
      capacityMax: tenant.capacityMax,
    });

    if (check.available) {
      return {
        reply: `Oui, c'est dispo pour ${couverts} le ${formatDateFr(date)} à ${time.slice(0, 5)}. Je le note ?`,
        status: "in_progress",
      };
    }
    return {
      reply: `Désolé, plus de place pour ${couverts} à cette heure-là (${check.remaining} couverts restants). Un autre créneau ?`,
      status: "in_progress",
    };
  }

  private async handleCreate(
    rawArgs: Record<string, unknown>,
    tenantId: string,
    channel: ChatRequest["channel"],
  ): Promise<ToolOutcome> {
    const parsed = reservationCoreSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        reply: "Il me manque une info pour finaliser, pouvez-vous préciser ?",
        status: "in_progress",
      };
    }

    try {
      const row = await this.deps.reservation.create({
        tenantId,
        data: { ...parsed.data, source: channel },
      });
      return {
        reply: `C'est confirmé, ${row.customerName} ! Réservation pour ${row.couverts} personnes le ${formatDateFr(row.dateReservation)} à ${row.heure.slice(0, 5)}. À très vite.`,
        status: "completed",
        reservationId: row.id,
      };
    } catch (err) {
      if (err instanceof DuplicateReservationError) {
        return {
          reply: "Vous avez déjà une réservation à cette heure-là. Voulez-vous la modifier ?",
          status: "in_progress",
        };
      }
      throw err;
    }
  }

  private async handleCancel(
    rawArgs: Record<string, unknown>,
    tenantId: string,
  ): Promise<ToolOutcome> {
    const phone = typeof rawArgs.customerPhone === "string" ? rawArgs.customerPhone : null;
    const date = typeof rawArgs.date === "string" ? rawArgs.date : null;
    if (!phone || !date) {
      return {
        reply: "Pour annuler, j'ai besoin de votre numéro et de la date de la réservation.",
        status: "in_progress",
      };
    }

    const found = await this.deps.reservation.findActiveByPhoneAndDate({
      tenantId,
      customerPhone: phone,
      dateReservation: date,
    });

    if (found.length === 0) {
      return {
        reply: "Aucune réservation trouvée à votre numéro pour cette date.",
        status: "completed",
      };
    }
    if (found.length > 1) {
      return {
        reply: "Plusieurs réservations correspondent — pouvez-vous préciser l'heure ?",
        status: "in_progress",
      };
    }

    const target = found[0];
    if (!target) throw new Error("found.length === 1 mais target undefined");

    const cancelled = await this.deps.reservation.cancel({ tenantId, id: target.id });
    return {
      reply: `Réservation annulée. Si vous changez d'avis, on est là.`,
      status: "completed",
      reservationId: cancelled.id,
    };
  }

  private handleAskField(rawArgs: Record<string, unknown>): ToolOutcome {
    const field = typeof rawArgs.field === "string" ? rawArgs.field : "";
    const questions: Record<string, string> = {
      customerName: "À quel nom ?",
      customerPhone: "Votre numéro de téléphone ?",
      partySize: "Pour combien de personnes ?",
      date: "Pour quel jour souhaitez-vous réserver ?",
      time: "À quelle heure ?",
    };
    return {
      reply: questions[field] ?? "Pouvez-vous préciser un peu plus ?",
      status: "in_progress",
    };
  }
}

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export type { Conversation, ConversationMessage };
