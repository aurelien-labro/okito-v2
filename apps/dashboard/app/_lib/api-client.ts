/**
 * Client HTTP léger vers l'API OKITO.
 *
 * Le JWT est résolu à chaque requête depuis la session Supabase (qui
 * rafraîchit automatiquement un token expiré), avec repli sur le token
 * stocké en localStorage (`okito_token`). Sans token → 401 → page de login.
 *
 * NEXT_PUBLIC_OKITO_API_URL contrôle la base ; défaut : http://localhost:3001.
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";

export const API_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_OKITO_API_URL) ||
  "http://localhost:3001";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("okito_token");
}

/**
 * Token valide pour la requête. Passe par Supabase getSession() qui renouvelle
 * silencieusement un access token expiré (évite les 401 après ~1h de session) ;
 * repli sur le token manuel de localStorage si Supabase n'est pas configuré.
 */
async function resolveToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (isSupabaseConfigured()) {
    // On ne renvoie JAMAIS un token périmé : jwtVerify échoue côté API (401)
    // avant le bypass dev X-Tenant-Id. getSession() peut renvoyer une session
    // dont l'access_token est déjà expiré → on vérifie expires_at et on force
    // un refresh si besoin ; si le refresh échoue, aucun token (l'API applique
    // son fallback en dev, ou renvoie 401 → écran de login en prod).
    try {
      const sb = getSupabase();
      const { data } = await sb.auth.getSession();
      const session = data.session;
      const nowSec = Math.floor(Date.now() / 1000);
      if (session?.access_token && (session.expires_at ?? 0) > nowSec + 30) {
        setToken(session.access_token);
        return session.access_token;
      }
      const { data: refreshed } = await sb.auth.refreshSession();
      const token = refreshed.session?.access_token;
      if (token) {
        setToken(token);
        return token;
      }
      clearToken();
    } catch {
      // pas de token valide
    }
    return null;
  }
  return getToken();
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
  const token = await resolveToken();
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
  assignedMemberId: string | null;
  durationMinutes: number | null;
  createdAt: string;
}

export async function listReservations(date?: string): Promise<{ data: Reservation[] }> {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return request(`/v1/reservations${q}`);
}

export async function getReservation(id: string): Promise<{ data: Reservation }> {
  return request(`/v1/reservations/${id}`);
}

export interface ReservationCreate {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  couverts: number;
  dateReservation: string;
  heure: string;
  notes?: string;
}

export async function createReservation(input: ReservationCreate): Promise<{ data: Reservation }> {
  return request("/v1/reservations", {
    method: "POST",
    body: JSON.stringify({ ...input, source: "manual" }),
  });
}

export interface ReservationUpdate {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  couverts?: number;
  dateReservation?: string;
  heure?: string;
  notes?: string;
  assignedMemberId?: string | null;
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

// --- Reviews ----------------------------------------------------------------

export interface ReviewSummary {
  count: number;
  average: number;
  recent: Array<{ rating: number; comment: string | null; submittedAt: string }>;
}

export async function getReviewSummary(tenantId: string): Promise<{ data: ReviewSummary }> {
  return request(`/v1/admin/reviews/${tenantId}/summary`);
}

// --- Analytics site ----------------------------------------------------------

export interface SiteAnalytics {
  today: number;
  last7Days: number;
}

export async function getSiteAnalytics(tenantId: string): Promise<{ data: SiteAnalytics }> {
  return request(`/v1/admin/site-analytics/${tenantId}`);
}

// --- Webhooks sortants ------------------------------------------------------

export type WebhookEvent =
  | "reservation.created"
  | "reservation.cancelled"
  | "reservation.no_show"
  | "waitlist.joined";

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "reservation.created",
  "reservation.cancelled",
  "reservation.no_show",
  "waitlist.joined",
];

export interface TenantWebhook {
  id: string;
  tenantId: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

export async function listWebhooks(tenantId: string): Promise<{ data: TenantWebhook[] }> {
  return request(`/v1/admin/webhooks/${tenantId}`);
}

export async function createWebhook(
  tenantId: string,
  input: { url: string; events?: WebhookEvent[] },
): Promise<{ data: TenantWebhook }> {
  return request(`/v1/admin/webhooks/${tenantId}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setWebhookActive(
  id: string,
  active: boolean,
): Promise<{ data: TenantWebhook }> {
  return request(`/v1/admin/webhooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function deleteWebhook(id: string): Promise<void> {
  await request(`/v1/admin/webhooks/${id}`, { method: "DELETE" });
}

// --- Export iCal ------------------------------------------------------------

export async function getIcalUrls(
  tenantId: string,
): Promise<{ data: { httpsUrl: string; webcalUrl: string } }> {
  return request(`/v1/admin/ical/${tenantId}`);
}

// --- Service catalog (prestations) -------------------------------------------

export interface ServiceCatalogItem {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number | null;
  currency: string;
  active: boolean;
  displayOrder: number;
  customFields: Record<string, unknown>;
  createdAt: string;
}

export interface ServiceCatalogInput {
  name: string;
  description?: string | null;
  durationMinutes?: number;
  priceCents?: number | null;
  currency?: string;
  displayOrder?: number;
}

export async function listServiceCatalog(
  tenantId: string,
  includeInactive = false,
): Promise<{ data: ServiceCatalogItem[] }> {
  const q = includeInactive ? "?includeInactive=true" : "";
  return request(`/v1/admin/service-catalog/${tenantId}${q}`);
}

export async function createServiceCatalogItem(
  tenantId: string,
  input: ServiceCatalogInput,
): Promise<{ data: ServiceCatalogItem }> {
  return request(`/v1/admin/service-catalog/${tenantId}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateServiceCatalogItem(
  id: string,
  patch: Partial<ServiceCatalogInput> & { active?: boolean },
): Promise<{ data: ServiceCatalogItem }> {
  return request(`/v1/admin/service-catalog/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteServiceCatalogItem(id: string): Promise<void> {
  await request(`/v1/admin/service-catalog/${id}`, { method: "DELETE" });
}

// --- Schedule rules (règles d'ouverture) --------------------------------------

export type ScheduleRuleKind = "weekly_closed" | "date_closed" | "date_special";

export interface ScheduleRule {
  id: string;
  tenantId: string;
  kind: ScheduleRuleKind;
  payload: {
    weekdays?: number[];
    date?: string;
    from?: string;
    to?: string;
    services?: ServiceWindow[];
  };
  active: boolean;
  createdAt: string;
}

export async function listScheduleRules(
  tenantId: string,
  includeInactive = false,
): Promise<{ data: ScheduleRule[] }> {
  const q = includeInactive ? "?includeInactive=true" : "";
  return request(`/v1/admin/schedule-rules/${tenantId}${q}`);
}

export async function createScheduleRule(
  tenantId: string,
  input: { kind: ScheduleRuleKind; payload: ScheduleRule["payload"] },
): Promise<{ data: ScheduleRule }> {
  return request(`/v1/admin/schedule-rules/${tenantId}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setScheduleRuleActive(
  id: string,
  active: boolean,
): Promise<{ data: ScheduleRule }> {
  return request(`/v1/admin/schedule-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function deleteScheduleRule(id: string): Promise<void> {
  await request(`/v1/admin/schedule-rules/${id}`, { method: "DELETE" });
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

// --- Jarvis -------------------------------------------------------------------

export type JarvisPolicy = "auto" | "auto_cancellable" | "approval";
export type JarvisActionStatus =
  | "awaiting_approval"
  | "scheduled"
  | "executed"
  | "cancelled"
  | "failed";

export interface JarvisAction {
  id: string;
  tenantId: string;
  type: string;
  summary: string;
  policy: JarvisPolicy;
  status: JarvisActionStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  cancellableUntil: string | null;
  createdAt: string;
  executedAt: string | null;
  cancelledAt: string | null;
}

export async function listJarvisActions(
  tenantId: string,
  status?: JarvisActionStatus,
): Promise<{ data: JarvisAction[] }> {
  const q = status ? `?status=${status}` : "";
  return request(`/v1/admin/jarvis-actions/${tenantId}${q}`);
}

export async function approveJarvisAction(
  tenantId: string,
  id: string,
): Promise<{ data: JarvisAction }> {
  return request(`/v1/admin/jarvis-actions/${tenantId}/${id}/approve`, { method: "POST" });
}

export async function cancelJarvisAction(
  tenantId: string,
  id: string,
): Promise<{ data: JarvisAction }> {
  return request(`/v1/admin/jarvis-actions/${tenantId}/${id}/cancel`, { method: "POST" });
}

export interface JarvisBrief {
  text: string;
  eventCount?: number;
  pendingApprovals?: number;
  at?: string;
}

export async function getJarvisBrief(tenantId: string): Promise<{ data: JarvisBrief }> {
  return request(`/v1/admin/jarvis-brief/${tenantId}`);
}

export async function regenerateJarvisBrief(tenantId: string): Promise<{ data: JarvisBrief }> {
  return request(`/v1/admin/jarvis-brief/${tenantId}`, { method: "POST" });
}

export interface JarvisChatMessage {
  role: "user" | "model";
  content: string;
}

export async function chatWithJarvis(
  tenantId: string,
  messages: JarvisChatMessage[],
): Promise<{ data: { reply: string } }> {
  return request(`/v1/admin/jarvis-brief/${tenantId}/chat`, {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

// --- Fiche client 360° --------------------------------------------------------

export interface TimelineEntry {
  kind: "reservation" | "review" | "email";
  at: string;
  title: string;
  detail: string | null;
}

export interface CustomerProfile {
  phone: string;
  name: string;
  email: string | null;
  visitCount: number;
  cancelledCount: number;
  noShowCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  averageRating: number | null;
  timeline: TimelineEntry[];
}

export async function getCustomer360(
  tenantId: string,
  phone: string,
): Promise<{ data: CustomerProfile }> {
  return request(`/v1/admin/customer-360/${tenantId}/${encodeURIComponent(phone)}`);
}

// --- Inbox (emails ingérés) ---------------------------------------------------

export interface InboxMessage {
  id: string;
  channel: "email";
  from: string | null;
  to: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null;
  createdAt: string;
}

export async function listInbox(
  tenantId: string,
  opts?: { before?: string; limit?: number },
): Promise<{ data: InboxMessage[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (opts?.before) params.set("before", opts.before);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  return request(`/v1/admin/inbox/${tenantId}${q ? `?${q}` : ""}`);
}

// --- Invoices (module Admin) --------------------------------------------------

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export interface InvoiceLine {
  label: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  number: string;
  status: InvoiceStatus;
  customerName: string;
  customerEmail: string | null;
  lines: InvoiceLine[];
  amountCents: number;
  currency: string;
  issuedAt: string | null;
  dueDate: string | null;
  paidAt: string | null;
  remindersSent: number;
  lastReminderAt: string | null;
  notes: string | null;
  createdAt: string;
}

export async function listInvoices(
  tenantId: string,
  status?: InvoiceStatus,
): Promise<{ data: Invoice[] }> {
  const q = status ? `?status=${status}` : "";
  return request(`/v1/admin/invoices/${tenantId}${q}`);
}

export async function createInvoice(
  tenantId: string,
  input: {
    customerName: string;
    customerEmail?: string | null;
    lines: InvoiceLine[];
    dueInDays?: number;
  },
): Promise<{ data: Invoice }> {
  return request(`/v1/admin/invoices/${tenantId}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function sendInvoice(tenantId: string, id: string): Promise<{ data: Invoice }> {
  return request(`/v1/admin/invoices/${tenantId}/${id}/send`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function markInvoicePaid(tenantId: string, id: string): Promise<{ data: Invoice }> {
  return request(`/v1/admin/invoices/${tenantId}/${id}/paid`, { method: "POST" });
}

export async function cancelInvoice(tenantId: string, id: string): Promise<{ data: Invoice }> {
  return request(`/v1/admin/invoices/${tenantId}/${id}/cancel`, { method: "POST" });
}

// --- Factures fournisseurs ----------------------------------------------------

export type SupplierInvoiceStatus = "received" | "approved" | "paid" | "disputed" | "cancelled";

export interface SupplierInvoice {
  id: string;
  tenantId: string;
  supplierName: string;
  invoiceNumber: string | null;
  status: SupplierInvoiceStatus;
  amountCents: number;
  currency: string;
  category: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  source: "manual" | "upload" | "email";
  extracted: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
}

export interface SupplierInvoiceExtraction {
  supplierName: string;
  invoiceNumber: string | null;
  amountCents: number;
  currency: string;
  invoiceDate: string | null;
  dueDate: string | null;
  category: string | null;
  confidence: number;
}

export interface SupplierInvoiceCreateInput {
  supplierName: string;
  invoiceNumber?: string | null;
  amountCents: number;
  currency?: string;
  category?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  source?: "manual" | "upload";
  extracted?: Record<string, unknown> | null;
}

export async function listSupplierInvoices(
  tenantId: string,
  status?: SupplierInvoiceStatus,
): Promise<{ data: SupplierInvoice[] }> {
  const q = status ? `?status=${status}` : "";
  return request(`/v1/admin/supplier-invoices/${tenantId}${q}`);
}

export async function createSupplierInvoice(
  tenantId: string,
  input: SupplierInvoiceCreateInput,
): Promise<{ data: SupplierInvoice }> {
  return request(`/v1/admin/supplier-invoices/${tenantId}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function extractSupplierInvoice(
  tenantId: string,
  file: { mimeType: string; dataBase64: string },
): Promise<{ data: SupplierInvoiceExtraction }> {
  return request(`/v1/admin/supplier-invoices/${tenantId}/extract`, {
    method: "POST",
    body: JSON.stringify(file),
  });
}

export async function transitionSupplierInvoice(
  tenantId: string,
  id: string,
  action: "approve" | "paid" | "dispute" | "cancel",
): Promise<{ data: SupplierInvoice }> {
  return request(`/v1/admin/supplier-invoices/${tenantId}/${id}/${action}`, { method: "POST" });
}

// --- Rapport TVA --------------------------------------------------------------

export interface VatRateLine {
  rateBps: number;
  grossCents: number;
  netCents: number;
  vatCents: number;
  count: number;
}

export interface VatReport {
  period: { year: number; month: number; fromIso: string; toIso: string };
  sales: { lines: VatRateLine[]; totalVatCents: number; totalGrossCents: number };
  purchases: { lines: VatRateLine[]; totalVatCents: number; totalGrossCents: number };
  netVatCents: number;
}

export async function getVatReport(
  tenantId: string,
  year: number,
  month: number,
): Promise<{ data: VatReport }> {
  return request(`/v1/admin/vat-report/${tenantId}?year=${year}&month=${month}`);
}

// --- Onboarding (diagnostic Jarvis) -------------------------------------------

export interface WebsiteScan {
  url: string;
  reachable: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  https: boolean;
  title: string | null;
  metaDescription: string | null;
  hasViewportMeta: boolean;
  htmlBytes: number | null;
  error?: string;
}

export interface GoogleBusinessScan {
  found: boolean;
  name: string | null;
  rating: number | null;
  reviewCount: number | null;
  address: string | null;
  openNow: boolean | null;
  error?: string;
}

export interface OnboardingDiagnostic {
  text: string;
  website: WebsiteScan | null;
  business: GoogleBusinessScan | null;
  generatedAt: string;
}

export async function runOnboardingDiagnostic(
  tenantId: string,
  input: { websiteUrl?: string; businessQuery?: string },
): Promise<{ data: OnboardingDiagnostic }> {
  return request(`/v1/admin/onboarding/${tenantId}/diagnostic`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Mailboxes (Gmail) --------------------------------------------------------

export type MailboxStatus = "active" | "paused" | "error";

export interface Mailbox {
  id: string;
  tenantId: string;
  provider: string;
  emailAddress: string;
  historyId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  status: MailboxStatus;
  createdAt: string;
}

export async function listMailboxes(tenantId: string): Promise<{ data: Mailbox[] }> {
  return request(`/v1/admin/mailboxes/${tenantId}`);
}

export async function connectMailbox(tenantId: string): Promise<{ data: { url: string } }> {
  return request(`/v1/admin/mailboxes/${tenantId}/connect`, { method: "POST" });
}

export async function connectOutlookMailbox(tenantId: string): Promise<{ data: { url: string } }> {
  return request(`/v1/admin/mailboxes/${tenantId}/connect-outlook`, { method: "POST" });
}

export async function connectImapMailbox(
  tenantId: string,
  input: {
    provider: "imap" | "yahoo";
    host?: string;
    port?: number;
    user: string;
    password: string;
  },
): Promise<{ data: Mailbox }> {
  return request(`/v1/admin/mailboxes/${tenantId}/imap`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setMailboxStatus(
  tenantId: string,
  id: string,
  status: "active" | "paused",
): Promise<{ data: Mailbox }> {
  return request(`/v1/admin/mailboxes/${tenantId}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteMailbox(tenantId: string, id: string): Promise<void> {
  await request(`/v1/admin/mailboxes/${tenantId}/${id}`, { method: "DELETE" });
}

// --- Google Business (avis Google) ------------------------------------------

export interface GoogleBusinessConnection {
  id: string;
  tenantId: string;
  accountName: string;
  locationName: string;
  locationTitle: string;
  reviewCursor: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  status: MailboxStatus;
  createdAt: string;
}

export async function listGoogleBusiness(
  tenantId: string,
): Promise<{ data: GoogleBusinessConnection[] }> {
  return request(`/v1/admin/google-business/${tenantId}`);
}

export async function connectGoogleBusiness(tenantId: string): Promise<{ data: { url: string } }> {
  return request(`/v1/admin/google-business/${tenantId}/connect`, { method: "POST" });
}

export async function setGoogleBusinessStatus(
  tenantId: string,
  id: string,
  status: "active" | "paused",
): Promise<{ data: GoogleBusinessConnection }> {
  return request(`/v1/admin/google-business/${tenantId}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteGoogleBusiness(tenantId: string, id: string): Promise<void> {
  await request(`/v1/admin/google-business/${tenantId}/${id}`, { method: "DELETE" });
}

// --- Écosystème : Stripe ------------------------------------------------------

export interface StripeAccount {
  id: string;
  tenantId: string;
  accountLabel: string;
  chargeCursor: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  status: MailboxStatus;
  createdAt: string;
}

export async function listStripeAccounts(tenantId: string): Promise<{ data: StripeAccount[] }> {
  return request(`/v1/admin/stripe/${tenantId}`);
}

export async function connectStripeAccount(
  tenantId: string,
  secretKey: string,
): Promise<{ data: StripeAccount }> {
  return request(`/v1/admin/stripe/${tenantId}/connect`, {
    method: "POST",
    body: JSON.stringify({ secretKey }),
  });
}

export async function setStripeAccountStatus(
  tenantId: string,
  id: string,
  status: "active" | "paused",
): Promise<{ data: StripeAccount }> {
  return request(`/v1/admin/stripe/${tenantId}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteStripeAccount(tenantId: string, id: string): Promise<void> {
  await request(`/v1/admin/stripe/${tenantId}/${id}`, { method: "DELETE" });
}

// --- Écosystème : connexion bancaire -----------------------------------------

export interface BankConnection {
  id: string;
  tenantId: string;
  provider: string;
  accountLabel: string;
  transactionCursor: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  status: MailboxStatus;
  createdAt: string;
}

export async function listBankConnections(tenantId: string): Promise<{ data: BankConnection[] }> {
  return request(`/v1/admin/bank/${tenantId}`);
}

export async function connectBank(
  tenantId: string,
  accessToken: string,
): Promise<{ data: BankConnection }> {
  return request(`/v1/admin/bank/${tenantId}/connect`, {
    method: "POST",
    body: JSON.stringify({ accessToken }),
  });
}

export async function setBankConnectionStatus(
  tenantId: string,
  id: string,
  status: "active" | "paused",
): Promise<{ data: BankConnection }> {
  return request(`/v1/admin/bank/${tenantId}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteBankConnection(tenantId: string, id: string): Promise<void> {
  await request(`/v1/admin/bank/${tenantId}/${id}`, { method: "DELETE" });
}

// --- Écosystème : Shopify -----------------------------------------------------

export interface ShopifyConnection {
  id: string;
  tenantId: string;
  shopDomain: string;
  shopLabel: string;
  orderCursor: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  status: MailboxStatus;
  createdAt: string;
}

export async function listShopifyConnections(
  tenantId: string,
): Promise<{ data: ShopifyConnection[] }> {
  return request(`/v1/admin/shopify/${tenantId}`);
}

export async function connectShopify(
  tenantId: string,
  shopDomain: string,
  accessToken: string,
): Promise<{ data: ShopifyConnection }> {
  return request(`/v1/admin/shopify/${tenantId}/connect`, {
    method: "POST",
    body: JSON.stringify({ shopDomain, accessToken }),
  });
}

export async function setShopifyConnectionStatus(
  tenantId: string,
  id: string,
  status: "active" | "paused",
): Promise<{ data: ShopifyConnection }> {
  return request(`/v1/admin/shopify/${tenantId}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteShopifyConnection(tenantId: string, id: string): Promise<void> {
  await request(`/v1/admin/shopify/${tenantId}/${id}`, { method: "DELETE" });
}

// --- Écosystème : Google Calendar --------------------------------------------

export interface CalendarConnection {
  id: string;
  tenantId: string;
  calendarId: string;
  calendarSummary: string;
  eventsCursor: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  status: MailboxStatus;
  createdAt: string;
}

export async function listCalendars(tenantId: string): Promise<{ data: CalendarConnection[] }> {
  return request(`/v1/admin/calendars/${tenantId}`);
}

export async function connectCalendar(tenantId: string): Promise<{ data: { url: string } }> {
  return request(`/v1/admin/calendars/${tenantId}/connect`, { method: "POST" });
}

export async function setCalendarStatus(
  tenantId: string,
  id: string,
  status: "active" | "paused",
): Promise<{ data: CalendarConnection }> {
  return request(`/v1/admin/calendars/${tenantId}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteCalendar(tenantId: string, id: string): Promise<void> {
  await request(`/v1/admin/calendars/${tenantId}/${id}`, { method: "DELETE" });
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
