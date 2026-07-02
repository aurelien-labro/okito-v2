import type { Conversation, ConversationMessage, Tenant } from "@okito/db";
import { ORCHESTRATOR_TOOLS, buildOrchestratorPrompt, getIndustryProfile } from "@okito/prompts";
import { isCancellationIntent } from "@okito/shared/keywords";
import type { LLMClient, LLMToolCall } from "@okito/shared/llm";
import { type ChatRequest, type ChatResponse, reservationCoreSchema } from "@okito/shared/types";
import { logger } from "../lib/logger.js";
import { type CapacityService, checkServiceWindow } from "./capacity.js";
import type { ConversationService } from "./conversation.js";
import type { LoyaltyService } from "./loyalty.js";
import type { Notifier } from "./notifier.js";
import { DuplicateReservationError, type ReservationService } from "./reservation.js";
import type { ServiceCatalogService } from "./service-catalog.js";
import type { TenantService } from "./tenant.js";
import type { WaitlistService } from "./waitlist.js";

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
  /** Optionnel — si absent, aucune notification n'est envoyée (les résas sont quand même créées). */
  notifier?: Notifier;
  /** Optionnel — si absent, le bot ne propose pas la liste d'attente quand slot plein. */
  waitlist?: WaitlistService;
  /** Optionnel — si présent, le bot reçoit les stats fidélité du client (habitué ?). */
  loyalty?: LoyaltyService;
  /** Optionnel — si présent et catalogue non vide, le bot demande la prestation avant l'heure. */
  serviceCatalog?: ServiceCatalogService;
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

    // Raccourci annulation : si c'est le premier message user et qu'il contient un mot-clé
    // d'annulation, on évite l'appel LLM et on appelle directement handleCancel
    // (qui demandera téléphone + date si manquants ou trouvera la résa sinon).
    const userTurns = convAfterUser.messages.filter((m) => m.role === "user").length;
    if (userTurns === 1 && isCancellationIntent(input.message)) {
      logger.info(
        { tenantId: input.tenantId, sessionKey: input.sessionKey },
        "cancellation shortcut",
      );
      const ctxShortcut = {
        conversationId: conv.id,
        collectedFields: convAfterUser.collectedFields ?? {},
      };
      await this.mergeFields(conv.id, input.tenantId, { intent: "cancel" }, ctxShortcut);
      const outcome = await this.handleCancel({}, tenant);
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
      return { reply: outcome.reply, conversationId: conv.id, status: outcome.status };
    }

    const now = nowInTimezone(tenant.timezone);
    const profile = getIndustryProfile(tenant.industry);

    // Si on a déjà capté un téléphone, on regarde si c'est un client connu
    // pour permettre au bot d'adapter son accueil ("Pierre, content de vous revoir !").
    const phone = pickString(convAfterUser.collectedFields?.customerPhone);
    const [customerStats, catalogItems] = await Promise.all([
      phone && this.deps.loyalty
        ? this.deps.loyalty.getByPhone(tenant.id, phone).catch(() => null)
        : Promise.resolve(null),
      this.deps.serviceCatalog
        ? this.deps.serviceCatalog.listByTenant(tenant.id).catch(() => [])
        : Promise.resolve([]),
    ]);

    const llmResponse = await this.deps.llm.complete({
      system: buildOrchestratorPrompt({
        restaurantName: tenant.name,
        timezone: tenant.timezone,
        todayIso: now.dateIso,
        nowTime: now.timeHm,
        dayOfWeek: now.dayOfWeek,
        nowHuman: now.human,
        channel: llmChannel,
        collectedFields: convAfterUser.collectedFields,
        profile,
        customer: customerStats
          ? {
              visitCount: customerStats.visitCount,
              isReturning: customerStats.isReturning,
              firstName: customerStats.customerName.split(" ")[0] ?? null,
            }
          : null,
        serviceCatalog: catalogItems.map((s) => ({
          name: s.name,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          currency: s.currency,
          description: s.description,
        })),
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
        return this.handleCheckAvailability(toolCall.arguments, tenant, channel, ctx);
      case "join_waitlist":
        return this.handleJoinWaitlist(toolCall.arguments, tenant, channel, ctx);
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

  private async clearFields(
    conversationId: string,
    tenantId: string,
    keys: string[],
    ctx: { collectedFields: Record<string, unknown> },
  ): Promise<void> {
    const updated = await this.deps.conversation.clearCollectedFields(
      conversationId,
      tenantId,
      keys,
    );
    ctx.collectedFields = updated.collectedFields ?? {};
  }

  private async handleCheckAvailability(
    rawArgs: Record<string, unknown>,
    tenant: Tenant,
    channel: ChatRequest["channel"],
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

    const window = checkServiceWindow(tenant, time);
    const isVoice = channel === "voice";

    if (!window.inService) {
      // Heure hors service : on libère time pour que le user puisse re-proposer.
      await this.clearFields(ctx.conversationId, tenant.id, ["time"], ctx);
      return {
        reply: isVoice
          ? `On n'est pas ouvert à cette heure-là, désolé. Plutôt vers ${window.suggestion ?? "midi ou 19h30"} ?`
          : `Désolé, on n'est pas ouvert à cette heure-là. Essayez ${window.suggestion ?? "12h30 ou 19h30"}.`,
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

    const dateStr = isVoice ? formatDateVoice(date) : formatDateFr(date);
    const timeStr = isVoice ? formatTimeVoice(time) : time.slice(0, 5);

    if (!check.available) {
      const waitlistEnabled = !!this.deps.waitlist && tenant.features?.waitlist !== false;
      // Slot plein : si waitlist activée, proposer plutôt que rejeter sec.
      // On garde date/time/partySize en collected pour que join_waitlist puisse les réutiliser.
      if (waitlistEnabled) {
        return {
          reply: isVoice
            ? `Pas de place pour ${couverts} ${dateStr} à ${timeStr}. Je peux vous mettre en liste d'attente, on vous prévient si une table se libère ?`
            : `Plus de place pour ${couverts} à ce créneau. Je peux vous noter en liste d'attente — on vous prévient dès qu'une table se libère. Ça vous va ?`,
          status: "in_progress",
        };
      }
      // Pas de waitlist → reset pour reproposer un autre créneau.
      await this.clearFields(ctx.conversationId, tenant.id, ["date", "time", "partySize"], ctx);
      return {
        reply: isVoice
          ? `Désolé, plus de place pour ${couverts} ${dateStr} à ${timeStr}. Un autre créneau ?`
          : `Désolé, plus de place pour ${couverts} à ce créneau (${check.remaining} couverts restants). Un autre horaire ?`,
        status: "in_progress",
      };
    }

    return {
      reply: `C'est dispo pour ${couverts} ${dateStr} à ${timeStr}. Je vous le note ?`,
      status: "in_progress",
    };
  }

  private async handleJoinWaitlist(
    rawArgs: Record<string, unknown>,
    tenant: Tenant,
    channel: ChatRequest["channel"],
    ctx: { conversationId: string; collectedFields: Record<string, unknown> },
  ): Promise<ToolOutcome> {
    if (!this.deps.waitlist) {
      return {
        reply: "La liste d'attente n'est pas activée pour ce restaurant.",
        status: "error",
      };
    }

    const merged: Record<string, unknown> = { ...ctx.collectedFields };
    for (const [k, v] of Object.entries(rawArgs)) {
      if (v !== undefined && v !== null && v !== "") merged[k] = v;
    }
    await this.mergeFields(ctx.conversationId, tenant.id, merged, ctx);

    const customerName = pickString(merged.customerName);
    const customerPhone = pickString(merged.customerPhone);
    const couverts = pickInt(merged.couverts ?? merged.partySize);
    const dateSouhaitee = pickString(merged.dateReservation ?? merged.date);
    const heureSouhaitee = pickString(merged.heure ?? merged.time);

    if (!customerName || !customerPhone || !couverts || !dateSouhaitee || !heureSouhaitee) {
      const missing = !customerName
        ? "customerName"
        : !customerPhone
          ? "customerPhone"
          : !couverts
            ? "partySize"
            : !dateSouhaitee
              ? "date"
              : "time";
      const friendly = humanField(missing);
      return {
        reply: friendly
          ? `Pour vous mettre en liste d'attente, il me faut ${friendly}.`
          : "Il me manque une info pour la liste d'attente.",
        status: "in_progress",
      };
    }

    try {
      await this.deps.waitlist.join({
        tenantId: tenant.id,
        customerName,
        customerPhone,
        couverts,
        dateSouhaitee,
        heureSouhaitee,
      });
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, "waitlist.join failed");
      return {
        reply: "Je n'ai pas réussi à vous noter en liste d'attente. Vous pouvez réessayer ?",
        status: "error",
      };
    }

    const isVoice = channel === "voice";
    const dateStr = isVoice ? formatDateVoice(dateSouhaitee) : formatDateFr(dateSouhaitee);
    const timeStr = isVoice ? formatTimeVoice(heureSouhaitee) : heureSouhaitee.slice(0, 5);
    return {
      reply: isVoice
        ? `C'est noté, vous êtes en liste d'attente pour ${dateStr} à ${timeStr}. On vous prévient si une table se libère.`
        : `C'est noté ${customerName.split(" ")[0] ?? customerName}, vous êtes en liste d'attente pour ${dateStr} à ${timeStr}. On vous prévient dès qu'une table se libère.`,
      status: "completed",
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
      // En mode table-based : re-check juste avant l'insert pour récupérer la
      // tableId à assigner. Évite les races avec d'autres résas créées entre
      // check_availability et create_reservation.
      const serviceName = pickString(merged.service);
      const [assign, catalogItem] = await Promise.all([
        this.deps.capacity.check({
          tenantId: tenant.id,
          date: parsed.data.dateReservation,
          heure: parsed.data.heure,
          couverts: parsed.data.couverts,
          capacityMax: tenant.capacityMax,
        }),
        serviceName && this.deps.serviceCatalog
          ? this.deps.serviceCatalog.findByName(tenant.id, serviceName).catch(() => null)
          : Promise.resolve(null),
      ]);
      const row = await this.deps.reservation.create({
        tenantId: tenant.id,
        data: { ...parsed.data, source: channel },
        tableId: assign.tableId ?? null,
        serviceId: catalogItem?.id ?? null,
        durationMinutes: catalogItem?.durationMinutes ?? null,
      });
      // Notifs en fire-and-forget : ne pas bloquer la réponse au client.
      if (this.deps.notifier) {
        void this.deps.notifier
          .notifyReservationCreated(tenant, row)
          .catch((err) =>
            logger.error({ err, reservationId: row.id }, "notifyReservationCreated failed"),
          );
      }
      const isVoice = channel === "voice";
      const dateStr = isVoice
        ? formatDateVoice(row.dateReservation)
        : formatDateFr(row.dateReservation);
      const timeStr = isVoice ? formatTimeVoice(row.heure) : row.heure.slice(0, 5);
      const firstName = row.customerName.split(" ")[0] ?? row.customerName;
      return {
        reply: isVoice
          ? `C'est noté ${firstName}, on vous attend ${dateStr} à ${timeStr} pour ${row.couverts} personnes. À bientôt !`
          : `C'est confirmé, ${row.customerName} ! Réservation pour ${row.couverts} personnes le ${dateStr} à ${timeStr}. À très vite.`,
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
    if (this.deps.notifier) {
      void this.deps.notifier
        .notifyReservationCancelled(tenant, cancelled)
        .catch((err) =>
          logger.error({ err, reservationId: cancelled.id }, "notifyReservationCancelled failed"),
        );
    }
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
      service: "Ce serait pour quelle prestation ?",
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

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Date "AAAA-MM-JJ" → expression naturelle pour TTS FR. */
function formatDateVoice(iso: string): string {
  const [yStr, mStr, dStr] = iso.split("-");
  if (!yStr || !mStr || !dStr) return iso;
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return iso;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(y, m - 1, d);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "demain";
  if (diffDays === 2) return "après-demain";
  if (diffDays > 2 && diffDays <= 7) return JOURS[target.getDay()] ?? iso;
  if (diffDays > 7 && diffDays <= 14) return `${JOURS[target.getDay()] ?? ""} prochain`.trim();
  return `le ${d} ${MOIS[m - 1] ?? ""}`.trim();
}

/**
 * Date/heure courante exprimées dans le fuseau du tenant (ex: "Europe/Paris").
 * Évite la dérive UTC qui décale les nuits/matins de plus ou moins 2 heures.
 */
function nowInTimezone(timezone: string): {
  dateIso: string;
  timeHm: string;
  dayOfWeek: string;
  human: string;
} {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const dateIso = `${parts.year}-${parts.month}-${parts.day}`;
  const timeHm = `${parts.hour}:${parts.minute}`;
  const dayOfWeek = (parts.weekday ?? "").toLowerCase();
  const monthName = MOIS[Number(parts.month) - 1] ?? parts.month;
  const human = `${dayOfWeek} ${Number(parts.day)} ${monthName} ${parts.year} à ${parts.hour}h${parts.minute}`;
  return { dateIso, timeHm, dayOfWeek, human };
}

/** "HH:MM" → "vingt heures trente" pour TTS FR. Approximation simple. */
function formatTimeVoice(hhmm: string): string {
  const [hStr, minStr] = hhmm.split(":");
  const h = Number(hStr);
  const min = Number(minStr ?? "0");
  if (Number.isNaN(h)) return hhmm;
  const heures = `${h} heure${h > 1 ? "s" : ""}`;
  if (!min || Number.isNaN(min)) return heures;
  if (min === 15) return `${heures} et quart`;
  if (min === 30) return `${heures} et demie`;
  if (min === 45) return `${heures} quarante-cinq`;
  return `${heures} ${min}`;
}

export type { Conversation, ConversationMessage };
