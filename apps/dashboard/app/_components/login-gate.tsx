"use client";

import type { Session } from "@supabase/supabase-js";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { clearToken, getToken, setToken } from "../_lib/api-client";
import { getSupabase, isSupabaseConfigured } from "../_lib/supabase";

/**
 * Gate qui force l'authentification avant d'afficher children.
 *
 * Deux modes selon la config Supabase :
 *
 * 1. Supabase configuré (NEXT_PUBLIC_SUPABASE_*) → magic-link email natif,
 *    session stockée par @supabase/ssr, JWT pushé dans okito_token pour
 *    compat avec api-client. Bouton "Déconnexion" qui appelle signOut().
 *
 * 2. Sinon → fallback MVP : champ texte où l'admin colle son JWT Supabase
 *    récupéré manuellement (Studio → Auth → user → JWT). Pratique pour
 *    dev / preview où Supabase Auth n'est pas branché.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const supabaseReady = isSupabaseConfigured();
  if (supabaseReady) return <SupabaseGate>{children}</SupabaseGate>;
  return <ManualTokenGate>{children}</ManualTokenGate>;
}

function SupabaseGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.access_token) setToken(data.session.access_token);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.access_token) setToken(sess.access_token);
      else clearToken();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!session) return <MagicLinkForm />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-3 text-xs text-stone-500">
        <span>{session.user.email}</span>
        <button
          type="button"
          onClick={async () => {
            await getSupabase().auth.signOut();
            clearToken();
          }}
          className="hover:text-stone-900 hover:underline"
        >
          Se déconnecter
        </button>
      </div>
      {children}
    </div>
  );
}

function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setErr(null);
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur envoi magic-link");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h2 className="text-xl font-semibold">Lien envoyé ✓</h2>
        <p className="mt-3 text-sm text-stone-600">
          Vérifie ta boîte mail (<strong>{email}</strong>) et clique sur le lien pour te connecter.
          Tu peux fermer cet onglet en attendant.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <h2 className="text-xl font-semibold tracking-tight">Connexion</h2>
      <p className="mt-2 text-sm text-stone-600">
        Reçois un lien magique par email pour te connecter au dashboard OKITO.
      </p>
      <form onSubmit={handle} className="mt-6 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.com"
          className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {sending ? "Envoi…" : "Recevoir le lien"}
        </button>
        {err && <div className="text-sm text-red-700">{err}</div>}
      </form>
    </div>
  );
}

function ManualTokenGate({ children }: { children: ReactNode }) {
  const [token, setLocalToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocalToken(getToken());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!token) return <ManualTokenForm onAuth={(t) => setLocalToken(t)} />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-3 text-xs text-stone-500">
        <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">JWT manuel</span>
        <button
          type="button"
          onClick={() => {
            clearToken();
            setLocalToken(null);
          }}
          className="hover:text-stone-900 hover:underline"
        >
          Se déconnecter
        </button>
      </div>
      {children}
    </div>
  );
}

function ManualTokenForm({ onAuth }: { onAuth: (token: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="mx-auto max-w-md py-12">
      <h2 className="text-xl font-semibold tracking-tight">Authentification (manuel)</h2>
      <p className="mt-2 text-sm text-stone-600">
        Supabase Auth n'est pas configuré pour ce dashboard. Colle un JWT Supabase récupéré dans
        Studio → Auth → user → JWT pour accéder aux endpoints.
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
        Pour activer le magic-link : renseigne <code>NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> au build du dashboard.
      </p>
    </div>
  );
}
