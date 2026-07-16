/**
 * One-shot : applique les migrations 0031 (Shopify), 0032 (WooCommerce),
 * 0033 (Google Ads + Meta).
 * Usage : pnpm --filter @okito/api exec tsx scripts/apply-migrations-0031-0033.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "@okito/db";
import { sql } from "drizzle-orm";

const db = getDb();
const files = [
  "0031_shopify_connections.sql",
  "0032_woocommerce_connections.sql",
  "0033_ads_connections.sql",
];

for (const file of files) {
  const path = resolve(import.meta.dirname, `../../../infra/supabase/migrations/${file}`);
  await db.execute(sql.raw(readFileSync(path, "utf8")));
  console.log(`migration ${file} appliquée`);
}

const rows = await db.execute(
  sql`select table_name from information_schema.tables
      where table_name in ('tenant_shopify_connections','tenant_woocommerce_connections','tenant_google_ads_connections','tenant_meta_connections')
      order by table_name`,
);
console.log(
  "tables présentes :",
  (rows as unknown as Array<{ table_name: string }>).map((r) => r.table_name).join(", "),
);

process.exit(0);
