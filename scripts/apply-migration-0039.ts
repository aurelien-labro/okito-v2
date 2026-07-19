/**
 * Applique la migration 0039 (tenant_connectors) sur la base pointée par
 * DATABASE_URL. Idempotent (create table if not exists / create index if not exists).
 *
 * Usage :
 *   $env:DATABASE_URL = "postgresql://postgres.<ref>:<pwd>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
 *   pnpm tsx scripts/apply-migration-0039.ts
 *
 * La DATABASE_URL n'est jamais affichée, ni écrite dans un fichier — elle
 * reste dans TON shell. Le script ne sort que la confirmation de succès.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "infra",
  "supabase",
  "migrations",
  "0039_tenant_connectors.sql",
);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL manquant. Pose-le dans ton shell :");
    console.error(
      '   $env:DATABASE_URL = "postgresql://postgres.<ref>:<pwd>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"',
    );
    process.exit(1);
  }

  const sql = await readFile(MIGRATION_PATH, "utf8");
  console.log(`→ Application de ${MIGRATION_PATH.split(/[\\/]/).pop()}`);

  const client = postgres(url, { prepare: false, ssl: "require", max: 1 });
  try {
    await client.unsafe(sql);
    const [{ exists }] = await client<{ exists: boolean }[]>`
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'tenant_connectors'
      ) as exists
    `;
    if (!exists) {
      console.error("❌ Table tenant_connectors introuvable après application.");
      process.exit(2);
    }
    console.log("✅ Migration 0039 appliquée — table tenant_connectors présente.");
  } catch (err) {
    console.error("❌ Échec de la migration :", err instanceof Error ? err.message : err);
    process.exit(3);
  } finally {
    await client.end({ timeout: 3 });
  }
}

main();
