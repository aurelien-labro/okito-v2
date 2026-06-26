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
const CHANNEL_TO_LLM: Record<ChatRequest["channel"], "web" | "whatsapp" | "voice"> = {
  web_widget: "web",
  manual: "web",
  whatsapp: "whatsapp",
  voice: "voice",
};

export interface ChatDeps {
  llm: LLMClient;
  conversation: ConversationService;
  reservation: ReservationService;
  tenant: TenantService;
  capacity: CapacityService;
}

interface ToolOutcome {
  reply: string;
  status: ChatResponse["status"];
  reservationId?: string;
}

export class ChatService {
  constructor(private readonly deps: ChatDeps) {}

  async handle(input: ChatRequest): Promise<ChatResponse> {
    // tenant lookup et findOrCreate sont indépendants → en parallèle.
    const [tenant, conv] = await Promise.all([
      this.deps.tenant.getById(input.tenantId),
      this.deps.conversation.findOrCreate({
        tenantId: input.tenantId,
        channel: input.channel,
        sessionKey: input.sessionKey,
      }),
    ]);

    const convAfterUser = await this.deps.conversation.appendMessage(conv.id, input.tenantId, {
      role: "user",
      content: input.message,
      at: new Date().toISOString(),
    });

    const llmMessages = convAfterUser.messages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));

    const llmChannel = CHANNEL_TO_LLM[input.channel];

    const llmResponse = await this.deps.llm.complete({
      system: buildOrchestratorPrompt({
        restaurantName: tenant.name,
        timezone: tenant.timezone,
        todayIso: new Date().toISOString().slice(0, 10),
        channel: llmChannel,
        collectedFields: convAfterUser.collectedFields,
      }),
      messages: llmMessages,
      tools: ORCHESTRATOR_TOOLS,
      temperature: 0.3,
      maxOutputTokens: 512,
    });

    const outcome: ToolOutcome = llmResponse.toolCalls[0]
      ? await this.executeTool(llmResponse.toolCalls[0], tenant, input.channel, {
          conversationId: conv.id,
          collectedFields: convAfterUser.collectedFields ?? {},
        })
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
    ctx: { conversationId: string; collectedFields: Record<string, unknown> },
  ): Promise<ToolOutcome> {
    switch (toolCall.name) {
      case "create_reservation":
        return this.handleCreate(toolCall.arguments, tenant, channel, ctx);
      case "cancel_reservation":
        return this.handleCancel(toolCall.arguments, tenant);
      case "ask_field":
        return this.handleAskField(toolCall.arguments, tenant.id, ctx);
      case "check_availability":
        return this.handleCheckAvailability(toolCall.arguments, tenant, ctx);
      default:
        logger.warn({ toolName: toolCall.name }, "tool inconnu retourné par le LLM");
        return { reply: "Désolé, je n'ai pas pu traiter cette action.", status: "error" };
    }
  }

  private async mergeFields(
    conversationId: string,
    tenantId: string,
    fields: Record<string, unknown>,
    ctx: { collectedFields: Record<string, unknown> },
  ): Promise<void> {
    const updated = await this.deps.conversation.mergeCollectedFields(
      conversationId,
      tenantId,
      fields,
    );
    ctx.collectedFields = updated.collectedFields ?? {};
  }

  private async handleCheckAvailability(
    rawArgs: Record<string, unknown>,
    tenant: Tenant,
    ctx: { conversationId: string; collectedFields: Record<string, unknown> },
  ): Promise<ToolOutcome> {
    const date = pickString(rawArgs.date) ?? pickString(ctx.collectedFields.date);
    const time = pickString(rawArgs.time) ?? pickString(ctx.collectedFields.time);
    const couverts = pickInt(rawArgs.partySize) ?? pickInt(ctx.collectedFields.partySize);

    if (!date || !time || !couverts) {
      return {
        reply: "Pour vérifier, il me faut la date, l'heure et le nombre de personnes.",
        status: "in_progress",
      };
    }

    await this.mergeFields(ctx.conversationId, tenant.id, { date, time, partySize: couverts }, ctx);

    const check = await this.deps.capacity.check({
      tenantId: tenant.id,
      date,
      heure: time,
      couverts,
      capacityMax: tenant.capacityMax,
    });

    return {
      reply: check.available
        ? `Oui, c'est dispo pour ${couverts} le ${formatDateFr(date)} à ${time.slice(0, 5)}. Je le note ?`
        : `Désolé, plus de place pour ${couverts} à cette heure-là (${check.remaining} couverts restants). Un autre créneau ?`,
      status: "in_progress",
    };
  }

  private async handleCreate(
    rawArgs: Record<string, unknown>,
    tenant: Tenant,
    channel: ChatRequest["channel"],
    ctx: { conversationId: string; collectedFields: Record<string, unknown> },
  ): Promise<ToolOutcome> {
    // Fusionner l'état serveur avec ce que le LLM a passé. Les args du LLM gagnent sur les conflits.
    const merged: Record<string, unknown> = { ...ctx.collectedFields };
    for (const [k, v] of Object.entries(rawArgs)) {
      if (v !== undefined && v !== null && v !== "") merged[k] = v;
    }
    await this.mergeFields(ctx.conversationId, tenant.id, merged, ctx);

    // Mapping des noms LLM (tool schema) vers les noms DB (reservationCoreSchema).
    const dbShape = {
      customerName: merged.customerName,
      customerPhone: merged.customerPhone,
      couverts: merged.couverts ?? merged.partySize,
      dateReservation: merged.dateReservation ?? merged.date,
      heure: merged.heure ?? merged.time,
      ...(merged.notes ? { notes: merged.notes } : {}),
    };
    const parsed = reservationCoreSchema.safeParse(dbShape);
    if (!parsed.success) {
      const missing = parsed.error.issues
        .map((i) => i.path[0])
        .filter((p): p is string => typeof p === "string");
      const friendly = humanField(missing[0]);
      return {
        reply: friendly
          ? `Il me manque ${friendly} pour finaliser. Tu peux me le donner ?`
          : "Il me manque une info pour finaliser, peux-tu préciser ?",
        status: "in_progress",
      };
    }

    try {
      const row = await this.deps.reservation.create({
        tenantId: tenant.id,
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
    tenant: Tenant,
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
      tenantId: tenant.id,
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

    const cancelled = await this.deps.reservation.cancel({ tenantId: tenant.id, id: target.id });
    return {
      reply: `Réservation annulée. Si vous changez d'avis, on est là.`,
      status: "completed",
      reservationId: cancelled.id,
    };
  }

  private async handleAskField(
    rawArgs: Record<string, unknown>,
    tenantId: string,
    ctx: { conversationId: string; collectedFields: Record<string, unknown> },
  ): Promise<ToolOutcome> {
    if (rawArgs.learned && typeof rawArgs.learned === "object") {
      await this.mergeFields(
        ctx.conversationId,
        tenantId,
        rawArgs.learned as Record<string, unknown>,
        ctx,
      );
    }
    const field = typeof rawArgs.field === "string" ? rawArgs.field : "";
    if (field && ctx.collectedFields[field] !== undefined && ctx.collectedFields[field] !== "") {
      return {
        reply: `J'ai bien noté. Et la suite ?`,
        status: "in_progress",
      };
    }
    const questions: Record<string, string> = {
      customerName: "À quel nom ?",
      customerPhone: "Votre numéro de téléphone ?",
      partySize: "Pour combien de personnes ?",
      date: "Pour quel jour souhaitez-vous réserver ?",
      time: "À quelle heure ?",
    };
    return {
      reply: questions[field] ?? "Peux-tu préciser un peu plus ?",
      status: "in_progress",
    };
  }
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number.parseInt(v, 10);
  return null;
}

function humanField(field: string | undefined): string | null {
  switch (field) {
    case "customerName":
      return "le nom";
    case "customerPhone":
      return "le numéro de téléphone";
    case "partySize":
    case "couverts":
      return "le nombre de personnes";
    case "date":
    case "dateReservation":
      return "la date";
    case "time":
    case "heure":
      return "l'heure";
    default:
      return null;
  }
}

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export type { Conversation, ConversationMessage };
