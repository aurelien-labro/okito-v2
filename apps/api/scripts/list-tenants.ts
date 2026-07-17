/** Lecture seule : liste id/nom/statut des tenants (choix du tenant de test voix). */
import "dotenv/config";
import { getDb } from "@okito/db";
import { sql } from "drizzle-orm";

const db = getDb();
const rows = await db.execute(
  sql`select id, name, slug, status from tenants order by created_at limit 10`,
);
for (const r of rows as unknown as Array<Record<string, unknown>>) {
  console.log(`${r.id}  ${r.status}  ${r.slug}  ${r.name}`);
}
process.exit(0);
