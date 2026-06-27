"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase browser-only.
 *
 * On utilise `@supabase/ssr` qui gère le storage cookies/localStorage hybride.
 * Le token est exposé à l'app dashboard via `supabase.auth.getSession()` et
 * envoyé en Bearer sur chaque requête API.
 *
 * Env vars (NEXT_PUBLIC_*) injectées au build Next.js, lisibles côté client.
 */

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant — configure-les pour le dashboard.",
    );
  }
  client = createBrowserClient(url, key);
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
