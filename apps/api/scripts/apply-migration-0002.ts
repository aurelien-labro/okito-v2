/**
 * One-shot : applique la migration 0002 (industry + features sur tenants).
 * Usage : pnpm --filter @okito/api exec tsx scripts/apply-migration-0002.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "@okito/db";
import { sql } from "drizzle-orm";

const db = getDb();
const path = resolve(
  import.meta.dirname,
  "../../../infra/supabase/migrations/0002_tenant_industry_features.sql",
);
const migration = readFileSync(path, "utf8");

await db.execute(sql.raw(migration));
console.log("migration 0002 appliquée");

const rows = await db.execute(sql`select slug, industry, features from tenants`);
for (const r of rows as unknown as Array<Record<string, unknown>>) {
  console.log(`${r.slug} → industry=${r.industry} features=${JSON.stringify(r.features)}`);
}

process.exit(0);
