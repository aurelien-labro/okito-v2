import type { Database } from "@okito/db";
import { sql } from "drizzle-orm";

export interface AvailabilityCheck {
  available: boolean;
  occupied: number;
  capacityMax: number;
  remaining: number;
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
