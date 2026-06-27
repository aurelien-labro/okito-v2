"use client";

import { type ReactNode, useEffect, useState } from "react";
import { clearToken, getToken, setToken } from "../_lib/api-client";

/**
 * Gate qui force la saisie d'un JWT avant d'afficher children.
 *
 * MVP : le JWT est saisi à la main (récupéré depuis Supabase Studio ou login
 * d'une autre app). Phase suivante : flow OAuth/Magic-link Supabase intégré.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const [token, setLocalToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocalToken(getToken());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!token) return <LoginForm onAuth={(t) => setLocalToken(t)} />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            clearToken();
            setLocalToken(null);
          }}
          className="text-xs text-stone-500 hover:text-stone-900 hover:underline"
        >
          Se déconnecter
        </button>
      </div>
      {children}
    </div>
  );
}

function LoginForm({ onAuth }: { onAuth: (token: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="mx-auto max-w-md py-12">
      <h2 className="text-xl font-semibold tracking-tight">Authentification</h2>
      <p className="mt-2 text-sm text-stone-600">
        Colle ton JWT Supabase (récupérable dans Supabase Studio → Auth → user → JWT) pour accéder
        aux endpoints protégés.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) {
            setToken(value.trim());
            onAuth(value.trim());
          }
        }}
        className="mt-6 space-y-3"
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="eyJhbGc..."
          rows={4}
          className="w-full rounded border border-stone-300 px-3 py-2 font-mono text-xs"
        />
        <button
          type="submit"
          className="w-full rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          Continuer
        </button>
      </form>
      <p className="mt-4 text-xs text-stone-500">
        Le token est gardé en <code>localStorage</code> (clé <code>okito_token</code>) et envoyé en
        Bearer sur chaque requête API.
      </p>
    </div>
  );
}
