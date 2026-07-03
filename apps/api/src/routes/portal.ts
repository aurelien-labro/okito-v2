import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError, NotFoundError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import { type CapacityService, checkServiceWindow } from "../services/capacity.js";
import type { Notifier } from "../services/notifier.js";
import type { ReservationService } from "../services/reservation.js";
import type { ScheduleRuleService } from "../services/schedule-rule.js";
import type { TenantService } from "../services/tenant.js";

export interface PortalDeps {
  reservation: ReservationService;
  tenant: TenantService;
  capacity: CapacityService;
  scheduleRules?: ScheduleRuleService;
  notifier?: Notifier;
}

const patchSchema = z
  .object({
    dateReservation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    heure: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    couverts: z.number().int().min(1).max(50),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: "Aucun champ à modifier" });

/**
 * Rate limit en mémoire par IP : le token est l'auth, on freine le brute-force.
 * 30 requêtes / minute / IP suffisent largement pour un usage légitime.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // Prune uniquement les fenêtres expirées — ne remet pas à zéro les IP actives.
    if (hits.size > 10_000) {
      for (const [key, e] of hits) {
        if (now - e.windowStart > WINDOW_MS) hits.delete(key);
      }
    }
    hits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_WINDOW;
}

/**
 * Portail self-service client — AUCUN JWT, le token (64 hex, hashé en DB)
 * est l'authentification. Réponses volontairement minimales : jamais le
 * téléphone/email complet, jamais d'identifiants internes autres que ceux
 * nécessaires à l'affichage.
 */
export function portalRoute(deps: PortalDeps) {
  const app = new Hono<AppEnv>();

  // Le portail est face client final : jamais de stacktrace, toujours un JSON propre.
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    return c.json({ error: { code: "internal_error", message: "Erreur serveur" } }, 500);
  });

  app.use("*", async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!rateLimit(ip)) {
      return c.json({ error: { code: "rate_limited", message: "Trop de requêtes" } }, 429);
    }
    return next();
  });

  // GET /r/:token — détails de la résa + nom de l'établissement
  app.get("/:token", async (c) => {
    const { reservation, tenant } = await loadByToken(deps, c.req.param("token"));
    return c.json({ data: publicView(reservation, tenant.name) });
  });

  // POST /r/:token/cancel — annulation (idempotente)
  app.post("/:token/cancel", async (c) => {
    const { reservation, tenant } = await loadByToken(deps, c.req.param("token"));
    if (reservation.status === "cancelled") {
      return c.json({ data: publicView(reservation, tenant.name) });
    }
    const cancelled = await deps.reservation.cancel({
      tenantId: reservation.tenantId,
      id: reservation.id,
    });
    if (deps.notifier) {
      void deps.notifier.notifyReservationCancelled(tenant, cancelled).catch(() => {});
    }
    return c.json({ data: publicView(cancelled, tenant.name) });
  });

  // PATCH /r/:token — modifier date/heure/couverts avec re-check complet
  app.patch("/:token", async (c) => {
    const { reservation, tenant } = await loadByToken(deps, c.req.param("token"));
    if (reservation.status !== "confirmed") {
      throw new HttpError(409, "not_editable", "Cette réservation ne peut plus être modifiée.");
    }
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message ?? "Corps invalide");
    }
    const patch = parsed.data;

    const date = patch.dateReservation ?? reservation.dateReservation;
    // Normalise en HH:MM:SS pour matcher le type `time` en DB (comparaisons exactes).
    const heure = patch.heure ? normalizeHeure(patch.heure) : reservation.heure;
    const couverts = patch.couverts ?? reservation.couverts;

    const rules = deps.scheduleRules
      ? await deps.scheduleRules.listByTenant(tenant.id).catch(() => [])
      : [];
    const window = checkServiceWindow(tenant, heure, { date, rules });
    if (window.closedDay || !window.inService) {
      throw new HttpError(
        409,
        "out_of_service",
        window.closedDay
          ? `L'établissement est ${window.closedReason ?? "fermé ce jour-là"}.`
          : `Cet horaire est en dehors des heures d'ouverture.${window.suggestion ? ` Essayez ${window.suggestion}.` : ""}`,
      );
    }

    // Exclut la résa éditée du décompte : elle occupe déjà sa place, sinon
    // elle se refuserait son propre créneau (mode tables ET mode couverts).
    const check = await deps.capacity.check({
      tenantId: tenant.id,
      date,
      heure,
      couverts,
      capacityMax: tenant.capacityMax,
      excludeReservationId: reservation.id,
    });
    const sameSlot = date === reservation.dateReservation && heure === reservation.heure;
    const available =
      check.mode === "tables"
        ? check.available
        : check.occupied - (sameSlot ? reservation.couverts : 0) + couverts <= check.capacityMax;
    if (!available) {
      throw new HttpError(409, "capacity_full", "Plus de place sur ce créneau.");
    }

    const updated = await deps.reservation.update({
      tenantId: tenant.id,
      id: reservation.id,
      patch: { ...patch, ...(patch.heure ? { heure } : {}) },
    });
    return c.json({ data: publicView(updated, tenant.name) });
  });

  return app;
}

async function loadByToken(deps: PortalDeps, token: string) {
  const reservation = await deps.reservation.findByAccessToken(token);
  if (!reservation) throw new NotFoundError("Réservation introuvable", "unknown_token");
  const tenant = await deps.tenant.getById(reservation.tenantId);
  return { reservation, tenant };
}

function publicView(
  r: {
    dateReservation: string;
    heure: string;
    couverts: number;
    status: string;
    customerName: string;
    customerPhone: string;
    durationMinutes: number | null;
  },
  tenantName: string,
) {
  return {
    tenantName,
    customerFirstName: r.customerName.trim().split(/\s+/)[0] ?? r.customerName,
    phoneMasked: maskPhone(r.customerPhone),
    dateReservation: r.dateReservation,
    heure: r.heure.slice(0, 5),
    couverts: r.couverts,
    durationMinutes: r.durationMinutes,
    status: r.status,
  };
}

function normalizeHeure(hm: string): string {
  return hm.length === 5 ? `${hm}:00` : hm;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••••${digits.slice(-4)}`;
}
