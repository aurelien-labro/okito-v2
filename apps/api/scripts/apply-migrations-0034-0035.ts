/**
 * One-shot : applique les migrations 0034 (multi-établissements) et
 * 0035 (campagnes marketing).
 * Usage : pnpm --filter @okito/api exec tsx scripts/apply-migrations-0034-0035.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "@okito/db";
import { sql } from "drizzle-orm";

const db = getDb();
const files = ["0034_tenant_parent.sql", "0035_campaigns.sql"];

for (const file of files) {
  const path = resolve(import.meta.dirname, `../../../infra/supabase/migrations/${file}`);
  await db.execute(sql.raw(readFileSync(path, "utf8")));
  console.log(`migration ${file} appliquée`);
}

const cols = await db.execute(
  sql`select column_name from information_schema.columns
      where table_name = 'tenants' and column_name = 'parent_tenant_id'`,
);
const tables = await db.execute(
  sql`select table_name from information_schema.tables where table_name = 'campaigns'`,
);
console.log(
  "vérif :",
  (cols as unknown as Array<{ column_name: string }>).map((r) => r.column_name).join(", "),
  "|",
  (tables as unknown as Array<{ table_name: string }>).map((r) => r.table_name).join(", "),
);

process.exit(0);
