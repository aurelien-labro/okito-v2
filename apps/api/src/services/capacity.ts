import {
  type Database,
  type DateClosedPayload,
  type DateSpecialPayload,
  type ScheduleRule,
  type ServiceWindow,
  type Tenant,
  type WeeklyClosedPayload,
  schema,
} from "@okito/db";
import { and, eq, ne, sql } from "drizzle-orm";

export interface AvailabilityCheck {
  available: boolean;
  occupied: number;
  capacityMax: number;
  remaining: number;
  /** Si mode table : id de la table assignable, sinon null. */
  tableId?: string | null;
  /** Mode utilisé pour la décision : "tables" ou "couverts" (legacy). */
  mode?: "tables" | "couverts";
}

export interface ServiceWindowCheck {
  /** L'heure tombe dans un service du tenant. */
  inService: boolean;
  /** Label du service si inService=true (ex: "déjeuner", "Check-in"). */
  service?: string;
  /** Suggestion d'horaire valide si inService=false. */
  suggestion?: string;
  /** L'établissement est fermé ce jour-là (règle weekly_closed / date_closed). */
  closedDay?: boolean;
  /** Explication de la fermeture ("fermé le lundi", "fermeture exceptionnelle"). */
  closedReason?: string;
}

const WEEKDAY_LABELS = [
  "le dimanche",
  "le lundi",
  "le mardi",
  "le mercredi",
  "le jeudi",
  "le vendredi",
  "le samedi",
];

/**
 * Vérifie qu'une heure HH:MM tombe dans une des plages de service du tenant.
 *
 * Source de vérité : tenant.services (JSONB) si non-vide.
 * Sinon fallback sur les 4 colonnes legacy lunch/dinner (resto historique).
 *
 * Si `opts.date` + `opts.rules` sont fournis, les règles d'ouverture s'appliquent :
 *   1. date_special matchant la date → ses plages remplacent les horaires normaux
 *      (prioritaire, permet d'OUVRIR un jour normalement fermé)
 *   2. weekly_closed / date_closed matchant → fermé (inService=false, closedDay=true)
 *   3. sinon → horaires normaux
 */
export function checkServiceWindow(
  tenant: Tenant,
  heure: string,
  opts?: { date?: string; rules?: ScheduleRule[] },
): ServiceWindowCheck {
  const t = normalizeTime(heure);
  if (!t) return { inService: false };

  let windows = effectiveServices(tenant);

  if (opts?.date && opts.rules && opts.rules.length > 0) {
    const active = opts.rules.filter((r) => r.active);

    const special = active.find(
      (r) => r.kind === "date_special" && (r.payload as DateSpecialPayload).date === opts.date,
    );
    if (special) {
      const payload = special.payload as DateSpecialPayload;
      windows = Array.isArray(payload.services) ? payload.services : [];
    } else {
      const closed = findClosureReason(active, opts.date);
      if (closed) return { inService: false, closedDay: true, closedReason: closed };
    }
  }

  if (windows.length === 0) return { inService: false };

  for (const w of windows) {
    const start = normalizeTime(w.start);
    const end = normalizeTime(w.end);
    if (start && end && t >= start && t <= end) {
      return { inService: true, service: w.label };
    }
  }

  const suggestion = windows
    .map((w) => `${formatHm(normalizeTime(w.start))} (${w.label})`)
    .join(" ou ");
  return { inService: false, suggestion };
}

/** Raison de fermeture pour cette date, ou null si ouvert. */
function findClosureReason(rules: ScheduleRule[], date: string): string | null {
  const weekday = new Date(`${date}T00:00:00`).getDay();

  for (const r of rules) {
    if (r.kind === "weekly_closed") {
      const payload = r.payload as WeeklyClosedPayload;
      if (Array.isArray(payload.weekdays) && payload.weekdays.includes(weekday)) {
        return `fermé ${WEEKDAY_LABELS[weekday] ?? "ce jour-là"}`;
      }
    }
    if (r.kind === "date_closed") {
      const payload = r.payload as DateClosedPayload;
      if (payload.date === date) return "fermeture exceptionnelle ce jour-là";
      if (payload.from && payload.to && date >= payload.from && date <= payload.to) {
        return "fermeture exceptionnelle sur cette période";
      }
    }
  }
  return null;
}

/** Retourne les plages effectives — services JSONB en priorité, sinon legacy lunch/dinner. */
export function effectiveServices(tenant: Tenant): ServiceWindow[] {
  if (Array.isArray(tenant.services) && tenant.services.length > 0) {
    return tenant.services;
  }
  return [
    { label: "déjeuner", start: tenant.serviceLunchStart, end: tenant.serviceLunchEnd },
    { label: "dîner", start: tenant.serviceDinnerStart, end: tenant.serviceDinnerEnd },
  ];
}

function normalizeTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : null;
}

function formatHm(t: string | null): string {
  if (!t) return "—";
  return t.replace(":", "h");
}

export class CapacityService {
  constructor(private readonly db: Database) {}

  /**
   * Mode automatique :
   *   - Si le tenant a au moins une table active → mode table
   *     (cherche la plus petite table libre dont capacity >= couverts)
   *   - Sinon → mode legacy (somme des couverts vs capacityMax)
   */
  async check(args: {
    tenantId: string;
    date: string;
    heure: string;
    couverts: number;
    capacityMax: number;
    /** Résa à exclure du décompte (édition d'une résa existante — elle occupe déjà sa place). */
    excludeReservationId?: string;
  }): Promise<AvailabilityCheck> {
    const tables = await this.db
      .select({
        id: schema.tenantTables.id,
        capacity: schema.tenantTables.capacity,
      })
      .from(schema.tenantTables)
      .where(
        and(eq(schema.tenantTables.tenantId, args.tenantId), eq(schema.tenantTables.active, true)),
      );

    if (tables.length > 0) {
      return this.checkTableMode({ ...args, tables });
    }
    return this.checkCouvertsMode(args);
  }

  private async checkCouvertsMode(args: {
    tenantId: string;
    date: string;
    heure: string;
    couverts: number;
    capacityMax: number;
  }): Promise<AvailabilityCheck> {
    const result = await this.db.execute(
      sql`SELECT get_creneau_capacity(${args.tenantId}::uuid, ${args.date}::date, ${args.heure}::time) AS occupied`,
    );
    const row = (result as unknown as Array<{ occupied: number | string | null }>)[0];
    const occupied = Number(row?.occupied ?? 0);
    const remaining = Math.max(0, args.capacityMax - occupied);
    const available = occupied + args.couverts <= args.capacityMax;

    return {
      available,
      occupied,
      capacityMax: args.capacityMax,
      remaining,
      mode: "couverts",
    };
  }

  private async checkTableMode(args: {
    tenantId: string;
    date: string;
    heure: string;
    couverts: number;
    capacityMax: number;
    excludeReservationId?: string;
    tables: Array<{ id: string; capacity: number }>;
  }): Promise<AvailabilityCheck> {
    // Toutes les tables triées par capacité croissante (smallest fit first).
    const sortedTables = [...args.tables].sort((a, b) => a.capacity - b.capacity);
    const totalCapacity = sortedTables.reduce((sum, t) => sum + t.capacity, 0);

    // Récupère les tables déjà occupées sur ce slot exact (hors résa éditée).
    const conditions = [
      eq(schema.reservations.tenantId, args.tenantId),
      eq(schema.reservations.dateReservation, args.date),
      eq(schema.reservations.heure, args.heure),
      eq(schema.reservations.status, "confirmed"),
    ];
    if (args.excludeReservationId) {
      conditions.push(ne(schema.reservations.id, args.excludeReservationId));
    }
    const occupiedRows = await this.db
      .select({ tableId: schema.reservations.tableId })
      .from(schema.reservations)
      .where(and(...conditions));
    const occupiedTableIds = new Set(
      occupiedRows.map((r) => r.tableId).filter((id): id is string => !!id),
    );
    const occupiedSeats = sortedTables
      .filter((t) => occupiedTableIds.has(t.id))
      .reduce((sum, t) => sum + t.capacity, 0);

    // Smallest free table with capacity >= couverts.
    const fit = sortedTables.find(
      (t) => !occupiedTableIds.has(t.id) && t.capacity >= args.couverts,
    );

    return {
      available: !!fit,
      occupied: occupiedSeats,
      capacityMax: totalCapacity,
      remaining: Math.max(0, totalCapacity - occupiedSeats),
      tableId: fit?.id ?? null,
      mode: "tables",
    };
  }
}
