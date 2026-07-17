/**
 * One-shot : applique la migration 0037 (jarvis_tool_settings — boutique).
 * Usage : pnpm --filter @okito/api exec tsx scripts/apply-migration-0037.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "@okito/db";
import { sql } from "drizzle-orm";

const db = getDb();
const path = resolve(
  import.meta.dirname,
  "../../../infra/supabase/migrations/0037_jarvis_tool_settings.sql",
);
await db.execute(sql.raw(readFileSync(path, "utf8")));
console.log("migration 0037_jarvis_tool_settings.sql appliquée");

const rows = await db.execute(
  sql`select table_name from information_schema.tables where table_name = 'jarvis_tool_settings'`,
);
console.log(
  "vérif :",
  (rows as unknown as Array<{ table_name: string }>).map((r) => r.table_name).join(", "),
);

process.exit(0);
