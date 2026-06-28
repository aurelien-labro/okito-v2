import { type Database, type ServiceWindow, type Tenant, schema } from "@okito/db";
import { and, eq, sql } from "drizzle-orm";

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
}

/**
 * Vérifie qu'une heure HH:MM tombe dans une des plages de service du tenant.
 *
 * Source de vérité : tenant.services (JSONB) si non-vide.
 * Sinon fallback sur les 4 colonnes legacy lunch/dinner (resto historique).
 */
export function checkServiceWindow(tenant: Tenant, heure: string): ServiceWindowCheck {
  const t = normalizeTime(heure);
  if (!t) return { inService: false };

  const windows = effectiveServices(tenant);
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
    tables: Array<{ id: string; capacity: number }>;
  }): Promise<AvailabilityCheck> {
    // Toutes les tables triées par capacité croissante (smallest fit first).
    const sortedTables = [...args.tables].sort((a, b) => a.capacity - b.capacity);
    const totalCapacity = sortedTables.reduce((sum, t) => sum + t.capacity, 0);

    // Récupère les tables déjà occupées sur ce slot exact.
    const occupiedRows = await this.db
      .select({ tableId: schema.reservations.tableId })
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.tenantId, args.tenantId),
          eq(schema.reservations.dateReservation, args.date),
          eq(schema.reservations.heure, args.heure),
          eq(schema.reservations.status, "confirmed"),
        ),
      );
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
