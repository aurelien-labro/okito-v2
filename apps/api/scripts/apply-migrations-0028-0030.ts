/**
 * One-shot : applique les migrations 0028 (Stripe), 0029 (banque), 0030 (Calendar).
 * Usage : pnpm --filter @okito/api exec tsx scripts/apply-migrations-0028-0030.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "@okito/db";
import { sql } from "drizzle-orm";

const db = getDb();
const files = [
  "0028_stripe_accounts.sql",
  "0029_bank_connections.sql",
  "0030_google_calendars.sql",
];

for (const file of files) {
  const path = resolve(import.meta.dirname, `../../../infra/supabase/migrations/${file}`);
  await db.execute(sql.raw(readFileSync(path, "utf8")));
  console.log(`migration ${file} appliquée`);
}

const rows = await db.execute(
  sql`select table_name from information_schema.tables
      where table_name in ('tenant_stripe_accounts','tenant_bank_connections','tenant_calendars')
      order by table_name`,
);
console.log(
  "tables présentes :",
  (rows as unknown as Array<{ table_name: string }>).map((r) => r.table_name).join(", "),
);

process.exit(0);
