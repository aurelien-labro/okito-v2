import type { LLMClient, LLMResponse } from "@okito/shared/llm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CapacityService } from "../src/services/capacity.js";
import { ChatService } from "../src/services/chat.js";
import type { ConversationService } from "../src/services/conversation.js";
import { DuplicateReservationError, type ReservationService } from "../src/services/reservation.js";
import type { TenantService } from "../src/services/tenant.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";

type StubFn = ReturnType<typeof vi.fn>;

function makeStubs() {
  const llm: { complete: StubFn } = { complete: vi.fn() };
  const conversation = {
    findOrCreate: vi.fn().mockResolvedValue({
      id: CONV_ID,
      tenantId: TENANT_ID,
      channel: "web_widget",
      sessionKey: "sess-1",
      step: "idle",
      collectedFields: {},
      messages: [],
      status: "active",
      reservationId: null,
      lastMessageAt: new Date(),
      createdAt: new Date(),
    }),
    appendMessage: vi.fn().mockImplementation((_id, _t, msg) =>
      Promise.resolve({
        id: CONV_ID,
        tenantId: TENANT_ID,
        channel: "web_widget",
        sessionKey: "sess-1",
        step: "idle",
        collectedFields: {},
        messages: [msg],
        status: "active",
        reservationId: null,
        lastMessageAt: new Date(),
        createdAt: new Date(),
      }),
    ),
    setStatus: vi.fn().mockResolvedValue(undefined),
  };
  const reservation = {
    create: vi.fn(),
    cancel: vi.fn(),
    findActiveByPhoneAndDate: vi.fn(),
  };
  const tenant = {
    getById: vi.fn().mockResolvedValue({
      id: TENANT_ID,
      name: "OKITO",
      slug: "okito",
      timezone: "Europe/Paris",
      capacityMax: 50,
    }),
  };
  const capacity = { check: vi.fn() };

  const service = new ChatService({
    llm: llm as unknown as LLMClient,
    conversation: conversation as unknown as ConversationService,
    reservation: reservation as unknown as ReservationService,
    tenant: tenant as unknown as TenantService,
    capacity: capacity as unknown as CapacityService,
  });

  return { service, llm, conversation, reservation, tenant, capacity };
}

const baseRequest = {
  tenantId: TENANT_ID,
  channel: "web_widget" as const,
  sessionKey: "sess-1",
  message: "Bonjour",
};

const noToolResponse: LLMResponse = {
  text: "Bonjour, comment puis-je vous aider ?",
  toolCalls: [],
  finishReason: "stop",
  usage: { promptTokens: 10, completionTokens: 5 },
};

function toolResponse(name: string, args: Record<string, unknown>): LLMResponse {
  return {
    text: null,
    toolCalls: [{ name, arguments: args }],
    finishReason: "tool_calls",
    usage: { promptTokens: 10, completionTokens: 5 },
  };
}

describe("ChatService.handle", () => {
  let stubs: ReturnType<typeof makeStubs>;
  beforeEach(() => {
    stubs = makeStubs();
  });

  it("renvoie le texte du LLM s'il n'y a pas de tool call", async () => {
    stubs.llm.complete.mockResolvedValueOnce(noToolResponse);
    const out = await stubs.service.handle(baseRequest);
    expect(out.reply).toBe("Bonjour, comment puis-je vous aider ?");
    expect(out.status).toBe("in_progress");
    expect(out.conversationId).toBe(CONV_ID);
  });

  it("ask_field → renvoie la question pré-définie pour le champ", async () => {
    stubs.llm.complete.mockResolvedValueOnce(toolResponse("ask_field", { field: "customerPhone" }));
    const out = await stubs.service.handle(baseRequest);
    expect(out.reply).toMatch(/numéro/i);
    expect(out.status).toBe("in_progress");
  });

  it("ask_field champ inconnu → fallback générique", async () => {
    stubs.llm.complete.mockResolvedValueOnce(
      toolResponse("ask_field", { field: "favorite_color" }),
    );
    const out = await stubs.service.handle(baseRequest);
    expect(out.reply).toMatch(/préciser/i);
  });

  it("create_reservation valide → résa créée + status completed", async () => {
    stubs.llm.complete.mockResolvedValueOnce(
      toolResponse("create_reservation", {
        customerName: "Jean Dupont",
        customerPhone: "+33611111111",
        couverts: 4,
        dateReservation: "2026-06-28",
        heure: "20:00",
      }),
    );
    stubs.reservation.create.mockResolvedValueOnce({
      id: "res-1",
      customerName: "Jean Dupont",
      couverts: 4,
      dateReservation: "2026-06-28",
      heure: "20:00:00",
    });
    const out = await stubs.service.handle(baseRequest);
    expect(out.status).toBe("completed");
    expect(out.reply).toMatch(/confirmé.*Jean Dupont/i);
    expect(stubs.conversation.setStatus).toHaveBeenCalledWith(
      CONV_ID,
      TENANT_ID,
      "completed",
      expect.objectContaining({ reservationId: "res-1" }),
    );
  });

  it("create_reservation duplicate → reply proposition de modifier", async () => {
    stubs.llm.complete.mockResolvedValueOnce(
      toolResponse("create_reservation", {
        customerName: "Jean Dupont",
        customerPhone: "+33611111111",
        couverts: 4,
        dateReservation: "2026-06-28",
        heure: "20:00",
      }),
    );
    stubs.reservation.create.mockRejectedValueOnce(new DuplicateReservationError());
    const out = await stubs.service.handle(baseRequest);
    expect(out.status).toBe("in_progress");
    expect(out.reply).toMatch(/déjà.*modifier/i);
  });

  it("create_reservation args invalides → demande de préciser", async () => {
    stubs.llm.complete.mockResolvedValueOnce(
      toolResponse("create_reservation", { customerName: "x" }),
    );
    const out = await stubs.service.handle(baseRequest);
    expect(out.status).toBe("in_progress");
    expect(out.reply).toMatch(/manque|préciser/i);
    expect(stubs.reservation.create).not.toHaveBeenCalled();
  });

  it("cancel_reservation sans args → demande infos", async () => {
    stubs.llm.complete.mockResolvedValueOnce(toolResponse("cancel_reservation", {}));
    const out = await stubs.service.handle(baseRequest);
    expect(out.reply).toMatch(/numéro/i);
    expect(stubs.reservation.cancel).not.toHaveBeenCalled();
  });

  it("cancel_reservation avec 1 résa match → annulée", async () => {
    stubs.llm.complete.mockResolvedValueOnce(
      toolResponse("cancel_reservation", { customerPhone: "+33611111111", date: "2026-06-28" }),
    );
    stubs.reservation.findActiveByPhoneAndDate.mockResolvedValueOnce([
      { id: "res-1", customerName: "Jean Dupont" },
    ]);
    stubs.reservation.cancel.mockResolvedValueOnce({ id: "res-1", status: "cancelled" });

    const out = await stubs.service.handle(baseRequest);
    expect(out.status).toBe("completed");
    expect(stubs.reservation.cancel).toHaveBeenCalledWith({ tenantId: TENANT_ID, id: "res-1" });
  });

  it("cancel_reservation 0 résa → message indicatif", async () => {
    stubs.llm.complete.mockResolvedValueOnce(
      toolResponse("cancel_reservation", { customerPhone: "+33611111111", date: "2026-06-28" }),
    );
    stubs.reservation.findActiveByPhoneAndDate.mockResolvedValueOnce([]);
    const out = await stubs.service.handle(baseRequest);
    expect(out.reply).toMatch(/aucune/i);
    expect(stubs.reservation.cancel).not.toHaveBeenCalled();
  });

  it("check_availability dispo → reply confirmant", async () => {
    stubs.llm.complete.mockResolvedValueOnce(
      toolResponse("check_availability", { date: "2026-06-28", time: "20:00", partySize: 4 }),
    );
    stubs.capacity.check.mockResolvedValueOnce({
      available: true,
      occupied: 10,
      capacityMax: 50,
      remaining: 40,
    });
    const out = await stubs.service.handle(baseRequest);
    expect(out.status).toBe("in_progress");
    expect(out.reply).toMatch(/dispo/i);
    expect(stubs.capacity.check).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, capacityMax: 50, couverts: 4 }),
    );
  });

  it("check_availability complet → reply désolé avec remaining", async () => {
    stubs.llm.complete.mockResolvedValueOnce(
      toolResponse("check_availability", { date: "2026-06-28", time: "20:00", partySize: 6 }),
    );
    stubs.capacity.check.mockResolvedValueOnce({
      available: false,
      occupied: 47,
      capacityMax: 50,
      remaining: 3,
    });
    const out = await stubs.service.handle(baseRequest);
    expect(out.reply).toMatch(/désolé.*3 couverts/i);
  });

  it("check_availability sans args → demande date/heure/personnes", async () => {
    stubs.llm.complete.mockResolvedValueOnce(toolResponse("check_availability", {}));
    const out = await stubs.service.handle(baseRequest);
    expect(out.reply).toMatch(/date.*heure.*personnes/i);
    expect(stubs.capacity.check).not.toHaveBeenCalled();
  });

  it("tool inconnu → reply erreur, status error", async () => {
    stubs.llm.complete.mockResolvedValueOnce(toolResponse("delete_database", {}));
    const out = await stubs.service.handle(baseRequest);
    expect(out.status).toBe("error");
    expect(out.reply).toMatch(/désolé|impossible/i);
  });
});
