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

/**
 * Tenant courant utilisé par l'admin pour piloter un tenant donné depuis le
 * dashboard. Passé en X-Tenant-Id à l'API ; le middleware admin l'accepte
 * comme override quand le JWT n'a pas de claim tenant_id.
 */
export function getCurrentTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("okito_current_tenant_id");
}

export function setCurrentTenantId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("okito_current_tenant_id", id);
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const tenantId = getCurrentTenantId();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { "X-Tenant-Id": tenantId } : {}),
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

// --- Stats business ---------------------------------------------------------

export interface StatsOverview {
  range: { fromIso: string; toIso: string; days: number };
  totals: {
    reservations: number;
    confirmed: number;
    cancelled: number;
    noShow: number;
    completed: number;
    couvertsTotal: number;
    couvertsAvg: number;
  };
  noShowRate: number;
  byDay: Array<{ date: string; total: number; confirmed: number; cancelled: number }>;
  bySource: Array<{ source: string; count: number }>;
  byHour: Array<{ hour: string; count: number }>;
}

export async function getStatsOverview(
  tenantId: string,
  days = 30,
): Promise<{ data: StatsOverview }> {
  return request(`/v1/admin/stats/${tenantId}/overview?days=${days}`);
}

// --- Members ---------------------------------------------------------------

export type TenantMemberRole = "owner" | "manager" | "staff";

export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string | null;
  invitedEmail: string | null;
  role: TenantMemberRole;
  invitedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export async function listMembers(tenantId: string): Promise<{ data: TenantMember[] }> {
  return request(`/v1/admin/members/${tenantId}`);
}

export async function inviteMember(input: {
  tenantId: string;
  email: string;
  role: TenantMemberRole;
}): Promise<{ data: TenantMember }> {
  return request(`/v1/admin/members/${input.tenantId}/invite`, {
    method: "POST",
    body: JSON.stringify({ email: input.email, role: input.role }),
  });
}

export async function updateMemberRole(
  memberId: string,
  role: TenantMemberRole,
): Promise<{ data: TenantMember }> {
  return request(`/v1/admin/members/${memberId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(memberId: string): Promise<void> {
  await request(`/v1/admin/members/${memberId}`, { method: "DELETE" });
}

// --- Waitlist ---------------------------------------------------------------

export type WaitlistStatus = "waiting" | "notified" | "converted" | "expired" | "cancelled";

export interface WaitlistEntry {
  id: string;
  tenantId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  couverts: number;
  dateSouhaitee: string;
  heureSouhaitee: string;
  flexMinutes: number;
  status: WaitlistStatus;
  notifiedAt: string | null;
  convertedAt: string | null;
  expiredAt: string | null;
  notes: string | null;
  createdAt: string;
}

export async function listWaitlist(
  tenantId: string,
  status?: WaitlistStatus,
): Promise<{ data: WaitlistEntry[] }> {
  const q = status ? `?status=${status}` : "";
  return request(`/v1/admin/waitlist/${tenantId}${q}`);
}

export async function notifyWaitlistEntry(id: string): Promise<void> {
  await request(`/v1/admin/waitlist/${id}/notify`, { method: "POST" });
}

export async function convertWaitlistEntry(id: string): Promise<void> {
  await request(`/v1/admin/waitlist/${id}/convert`, { method: "POST" });
}

export async function expireWaitlistEntry(id: string): Promise<void> {
  await request(`/v1/admin/waitlist/${id}/expire`, { method: "POST" });
}

export async function cancelWaitlistEntry(id: string): Promise<void> {
  await request(`/v1/admin/waitlist/${id}`, { method: "DELETE" });
}

// --- Tables (capacité par table) -------------------------------------------

export interface TenantTable {
  id: string;
  tenantId: string;
  label: string;
  capacity: number;
  active: boolean;
  createdAt: string;
}

export async function listTables(
  tenantId: string,
  includeInactive = false,
): Promise<{ data: TenantTable[] }> {
  const q = includeInactive ? "?includeInactive=true" : "";
  return request(`/v1/admin/tables/${tenantId}${q}`);
}

export async function createTable(input: {
  tenantId: string;
  label: string;
  capacity: number;
}): Promise<{ data: TenantTable }> {
  return request(`/v1/admin/tables/${input.tenantId}`, {
    method: "POST",
    body: JSON.stringify({ label: input.label, capacity: input.capacity }),
  });
}

export async function updateTable(
  id: string,
  patch: Partial<Pick<TenantTable, "label" | "capacity" | "active">>,
): Promise<{ data: TenantTable }> {
  return request(`/v1/admin/tables/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteTable(id: string): Promise<void> {
  await request(`/v1/admin/tables/${id}`, { method: "DELETE" });
}

// --- Loyalty ----------------------------------------------------------------

export interface CustomerStats {
  customerPhone: string;
  customerName: string;
  visitCount: number;
  firstVisit: string | null;
  lastVisit: string | null;
  isReturning: boolean;
}

export async function listTopCustomers(
  tenantId: string,
  limit = 20,
): Promise<{ data: CustomerStats[] }> {
  return request(`/v1/admin/loyalty/${tenantId}/top?limit=${limit}`);
}

export async function getCustomerStats(
  tenantId: string,
  phone: string,
): Promise<{ data: CustomerStats | null }> {
  return request(`/v1/admin/loyalty/${tenantId}/by-phone/${encodeURIComponent(phone)}`);
}

export async function statsForPhones(
  tenantId: string,
  phones: string[],
): Promise<{ data: CustomerStats[] }> {
  return request(`/v1/admin/loyalty/${tenantId}/stats`, {
    method: "POST",
    body: JSON.stringify({ phones }),
  });
}

// --- Reminders --------------------------------------------------------------

export interface ReminderRunResult {
  candidatesFound: number;
  sent: number;
  skipped: number;
  failed: number;
  dryRun?: boolean;
}

export async function runReminders(opts?: { dryRun?: boolean }): Promise<ReminderRunResult> {
  const q = opts?.dryRun ? "?dryRun=true" : "";
  return request(`/v1/admin/reminders/run${q}`, { method: "POST" });
}
