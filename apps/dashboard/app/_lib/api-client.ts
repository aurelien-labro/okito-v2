/**
 * Client HTTP léger vers l'API OKITO.
 *
 * Lit le JWT depuis localStorage (`okito_token`) côté navigateur. Si pas
 * de token, retourne 401 et la page de login s'affiche.
 *
 * NEXT_PUBLIC_OKITO_API_URL contrôle la base ; défaut : http://localhost:3001.
 */

const API_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_OKITO_API_URL) ||
  "http://localhost:3001";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("okito_token");
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("okito_token", token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("okito_token");
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err: ApiError = {
      status: res.status,
      code: body?.error?.code ?? "unknown",
      message: body?.error?.message ?? `HTTP ${res.status}`,
    };
    throw err;
  }
  return (await res.json()) as T;
}

export interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  couverts: number;
  dateReservation: string;
  heure: string;
  status: string;
  source: string;
  notes: string | null;
  createdAt: string;
}

export async function listReservations(date?: string): Promise<{ data: Reservation[] }> {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return request(`/v1/reservations${q}`);
}

export async function getReservation(id: string): Promise<{ data: Reservation }> {
  return request(`/v1/reservations/${id}`);
}

export interface ReservationUpdate {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  couverts?: number;
  dateReservation?: string;
  heure?: string;
  notes?: string;
}

export async function updateReservation(
  id: string,
  patch: ReservationUpdate,
): Promise<{ data: Reservation }> {
  return request(`/v1/reservations/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function cancelReservation(id: string): Promise<{ data: Reservation }> {
  return request(`/v1/reservations/${id}/cancel`, { method: "POST" });
}

export interface HealthStatus {
  status: string;
  service: string;
  env: string;
  llm: { status: string; model: string };
  db: { status: string; latencyMs?: number; error?: string };
  notifiers?: {
    email: { provider: string; status: string };
    whatsapp: { provider: string; status: string };
    sms: { provider: string; status: string };
    webhookSignatureValidation: boolean;
  };
  voice?: { vapi: { status: string; assistantId?: string } };
  observability?: { sentry: { status: string } };
}

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_URL}/health`);
  return (await res.json()) as HealthStatus;
}

// --- Tenants admin -----------------------------------------------------------

export interface ServiceWindow {
  label: string;
  start: string;
  end: string;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  timezone: string;
  industry: string;
  features: Record<string, boolean | undefined>;
  services: ServiceWindow[];
  capacityMax: number;
  status: "active" | "suspended" | "trial";
  remindersEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantCreate {
  slug: string;
  name: string;
  industry?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  timezone?: string;
  capacityMax?: number;
  features?: Record<string, boolean>;
  services?: ServiceWindow[];
  status?: "active" | "suspended" | "trial";
}

export type TenantUpdate = Partial<Omit<TenantCreate, "slug">> & {
  remindersEnabled?: boolean;
};

export async function listTenants(): Promise<{ data: Tenant[] }> {
  return request("/v1/admin/tenants");
}

export async function getTenant(id: string): Promise<{ data: Tenant }> {
  return request(`/v1/admin/tenants/${id}`);
}

export async function createTenant(input: TenantCreate): Promise<{ data: Tenant }> {
  return request("/v1/admin/tenants", { method: "POST", body: JSON.stringify(input) });
}

export async function updateTenant(id: string, patch: TenantUpdate): Promise<{ data: Tenant }> {
  return request(`/v1/admin/tenants/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function suspendTenant(id: string): Promise<{ data: Tenant }> {
  return request(`/v1/admin/tenants/${id}/suspend`, { method: "POST" });
}

export async function activateTenant(id: string): Promise<{ data: Tenant }> {
  return request(`/v1/admin/tenants/${id}/activate`, { method: "POST" });
}

// --- Audit log ---------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogFilters {
  tenantId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export async function listAuditLog(filters: AuditLogFilters = {}): Promise<{
  data: AuditLogEntry[];
}> {
  const params = new URLSearchParams();
  if (filters.tenantId) params.set("tenantId", filters.tenantId);
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.entityId) params.set("entityId", filters.entityId);
  if (filters.limit) params.set("limit", String(filters.limit));
  const q = params.toString();
  return request(`/v1/admin/audit${q ? `?${q}` : ""}`);
}
