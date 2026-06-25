import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb(databaseUrl?: string) {
  if (cachedDb) return cachedDb;

  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL manquant — voir .env.example");
  }

  const client = postgres(url, { prepare: false });
  cachedDb = drizzle(client, { schema });
  return cachedDb;
}

export type Database = ReturnType<typeof getDb>;
