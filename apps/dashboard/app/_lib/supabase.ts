"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase browser-only.
 *
 * Config auth explicite (PKCE + detectSessionInUrl) : sinon on dépend des
 * défauts de @supabase/ssr qui varient entre versions. PKCE est requis pour
 * OAuth Google en 2024+ (implicit flow deprecated côté Google).
 *
 * Le token est exposé à l'app dashboard via `supabase.auth.getSession()` et
 * poussé dans localStorage `okito_token` par SessionSync (auth-shell.tsx),
 * puis envoyé en Bearer sur chaque requête API.
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
  client = createBrowserClient(url, key, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
