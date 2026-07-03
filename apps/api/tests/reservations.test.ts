import { describe, expect, it, vi } from "vitest";
import { type AppServices, createApp } from "../src/app.js";
import { loadEnv } from "../src/lib/env.js";
import { NotFoundError } from "../src/lib/errors.js";
import { DuplicateReservationError, ReservationService } from "../src/services/reservation.js";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const RES_ID = "22222222-2222-4222-8222-222222222222";

const baseEnv = {
  NODE_ENV: "test",
  PORT: "3001",
  APP_URL: "http://localhost:3000",
  LLM_MODEL: "gemini-2.5-flash",
  LLM_FALLBACK_MODEL: "gemini-2.5-pro",
  LLM_TIMEOUT_MS: "1000",
  LLM_RETRY_MAX: "1",
} as NodeJS.ProcessEnv;

type ServiceCalls = {
  list: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

function makeServices(): { service: ReservationService; calls: ServiceCalls } {
  const calls: ServiceCalls = {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  };
  // Pas besoin de vraie instance Drizzle : on stub les méthodes via Object.assign.
  const service = Object.assign(
    Object.create(ReservationService.prototype),
    calls,
  ) as ReservationService;
  return { service, calls };
}

function makeAppWithStub(): {
  app: ReturnType<typeof createApp>;
  calls: ServiceCalls;
  authHeader: { "X-Tenant-Id": string };
} {
  const env = loadEnv(baseEnv);
  const { service, calls } = makeServices();
  const services: AppServices = { reservation: service };
  const app = createApp(env, services);
  return { app, calls, authHeader: { "X-Tenant-Id": TENANT_A } };
}

const validCreatePayload = {
  customerName: "Jean Dupont",
  customerPhone: "+33611111111",
  couverts: 4,
  dateReservation: "2026-06-28",
  heure: "20:00",
};

describe("GET /v1/reservations", () => {
  it("renvoie la liste filtrée par date", async () => {
    const { app, calls, authHeader } = makeAppWithStub();
    calls.list.mockResolvedValueOnce([{ id: RES_ID }]);

    const res = await app.request("/v1/reservations?date=2026-06-28", { headers: authHeader });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ id: RES_ID }] });
    expect(calls.list).toHaveBeenCalledWith({ tenantId: TENANT_A, date: "2026-06-28" });
  });

  it("refuse une date mal formée", async () => {
    const { app, authHeader } = makeAppWithStub();
    const res = await app.request("/v1/reservations?date=demain", { headers: authHeader });
    expect(res.status).toBe(400);
  });

  it("401 sans auth", async () => {
    const { app } = makeAppWithStub();
    const res = await app.request("/v1/reservations");
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/reservations/:id", () => {
  it("renvoie la résa si trouvée", async () => {
    const { app, calls, authHeader } = makeAppWithStub();
    calls.getById.mockResolvedValueOnce({ id: RES_ID, customerName: "Jean" });
    const res = await app.request(`/v1/reservations/${RES_ID}`, { headers: authHeader });
    expect(res.status).toBe(200);
    expect(calls.getById).toHaveBeenCalledWith({ tenantId: TENANT_A, id: RES_ID });
  });

  it("404 si NotFoundError remonté par le service", async () => {
    const { app, calls, authHeader } = makeAppWithStub();
    calls.getById.mockRejectedValueOnce(new NotFoundError());
    const res = await app.request(`/v1/reservations/${RES_ID}`, { headers: authHeader });
    expect(res.status).toBe(404);
  });

  it("400 si id n'est pas un uuid", async () => {
    const { app, authHeader } = makeAppWithStub();
    const res = await app.request("/v1/reservations/abc", { headers: authHeader });
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/reservations", () => {
  it("201 sur création réussie", async () => {
    const { app, calls, authHeader } = makeAppWithStub();
    calls.create.mockResolvedValueOnce({ id: RES_ID, ...validCreatePayload });
    const res = await app.request("/v1/reservations", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(validCreatePayload),
    });
    expect(res.status).toBe(201);
    expect(calls.create).toHaveBeenCalled();
  });

  it("ne renvoie JAMAIS le token portail brut dans la réponse", async () => {
    const { app, calls, authHeader } = makeAppWithStub();
    calls.create.mockResolvedValueOnce({
      id: RES_ID,
      ...validCreatePayload,
      accessToken: "deadbeef".repeat(8),
    });
    const res = await app.request("/v1/reservations", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(validCreatePayload),
    });
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data.accessToken).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("deadbeef");
  });

  it("409 si DuplicateReservationError", async () => {
    const { app, calls, authHeader } = makeAppWithStub();
    calls.create.mockRejectedValueOnce(new DuplicateReservationError());
    const res = await app.request("/v1/reservations", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(validCreatePayload),
    });
    expect(res.status).toBe(409);
  });

  it("400 si payload incomplet", async () => {
    const { app, authHeader } = makeAppWithStub();
    const res = await app.request("/v1/reservations", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: "x" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /v1/reservations/:id", () => {
  it("200 sur mise à jour partielle", async () => {
    const { app, calls, authHeader } = makeAppWithStub();
    calls.update.mockResolvedValueOnce({ id: RES_ID, couverts: 6, heure: "21:00" });
    const res = await app.request(`/v1/reservations/${RES_ID}`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ couverts: 6, heure: "21:00" }),
    });
    expect(res.status).toBe(200);
    expect(calls.update).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      id: RES_ID,
      patch: { couverts: 6, heure: "21:00" },
    });
  });

  it("400 si patch invalide (couverts hors borne)", async () => {
    const { app, authHeader } = makeAppWithStub();
    const res = await app.request(`/v1/reservations/${RES_ID}`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ couverts: 999 }),
    });
    expect(res.status).toBe(400);
  });

  it("404 si NotFoundError remonté par le service", async () => {
    const { app, calls, authHeader } = makeAppWithStub();
    calls.update.mockRejectedValueOnce(new NotFoundError());
    const res = await app.request(`/v1/reservations/${RES_ID}`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ couverts: 6 }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/reservations/:id/cancel", () => {
  it("200 sur annulation", async () => {
    const { app, calls, authHeader } = makeAppWithStub();
    calls.cancel.mockResolvedValueOnce({ id: RES_ID, status: "cancelled" });
    const res = await app.request(`/v1/reservations/${RES_ID}/cancel`, {
      method: "POST",
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    expect(calls.cancel).toHaveBeenCalledWith({ tenantId: TENANT_A, id: RES_ID });
  });
});
