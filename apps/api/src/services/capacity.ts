import type { Database, Tenant } from "@okito/db";
import { sql } from "drizzle-orm";

export interface AvailabilityCheck {
  available: boolean;
  occupied: number;
  capacityMax: number;
  remaining: number;
}

export interface ServiceWindowCheck {
  /** L'heure tombe dans un service (déjeuner ou dîner) du tenant. */
  inService: boolean;
  /** Nom du service si inService=true ("déjeuner" / "dîner"). */
  service?: "déjeuner" | "dîner";
  /** Suggestion d'horaire valide si inService=false. */
  suggestion?: string;
}

/**
 * Vérifie qu'une heure HH:MM tombe dans une des deux plages de service du tenant.
 * Si hors-service, renvoie une suggestion ("essayez 12h30 (déjeuner) ou 19h30 (dîner)").
 */
export function checkServiceWindow(tenant: Tenant, heure: string): ServiceWindowCheck {
  const t = normalizeTime(heure);
  if (!t) return { inService: false };
  const lunchStart = normalizeTime(tenant.serviceLunchStart);
  const lunchEnd = normalizeTime(tenant.serviceLunchEnd);
  const dinnerStart = normalizeTime(tenant.serviceDinnerStart);
  const dinnerEnd = normalizeTime(tenant.serviceDinnerEnd);

  if (lunchStart && lunchEnd && t >= lunchStart && t <= lunchEnd) {
    return { inService: true, service: "déjeuner" };
  }
  if (dinnerStart && dinnerEnd && t >= dinnerStart && t <= dinnerEnd) {
    return { inService: true, service: "dîner" };
  }

  const suggestion = `${formatHm(lunchStart)} (déjeuner) ou ${formatHm(dinnerStart)} (dîner)`;
  return { inService: false, suggestion };
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
   * Appelle la fonction SQL get_creneau_capacity (somme des couverts confirmés)
   * et compare au plafond du tenant.
   */
  async check(args: {
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
    };
  }
}
