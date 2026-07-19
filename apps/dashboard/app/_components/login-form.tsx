"use client";

import { type FormEvent, useState } from "react";
import { getSupabase } from "../_lib/supabase";

/**
 * Formulaire de connexion pur (sans gate). Utilisé plein écran par l'AuthGate.
 * Trois voies : Google OAuth, magic link email, mot de passe.
 */
export function LoginForm() {
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleMagic(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/welcome` },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur envoi magic-link");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setErr(null);
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/welcome` },
      });
      if (error) throw error;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur connexion Google");
      setBusy(false);
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur connexion");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="anim-fade-up text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 anim-scale-in">
          <span className="ti ti-mail-check text-[19px]" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-medium tracking-tight text-slate-900">Lien envoyé</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm text-slate-600">
          Ouvre l'email envoyé à <span className="font-medium text-slate-900">{email}</span> et
          clique sur le lien pour continuer.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-6 text-[12px] text-slate-500 hover:text-slate-900 hover:underline"
        >
          ← Renvoyer ou changer de méthode
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex size-9 items-center justify-center rounded-lg okito-brand-mark text-[14px] font-medium text-white anim-scale-in">
          O
        </div>
        <h2 className="text-xl font-medium tracking-tight text-slate-900">Bon retour</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Connecte-toi pour retrouver ton cockpit Jarvis.
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className="okito-hairline okito-hover flex w-full items-center justify-center gap-2.5 rounded-md bg-white px-4 py-2.5 text-[13px] font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
      >
        <GoogleIcon />
        Continuer avec Google
      </button>

      <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        ou par email
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="okito-hairline mb-4 flex gap-1 rounded-md bg-slate-50 p-0.5 text-[11px]">
        <button
          type="button"
          onClick={() => setMode("magic")}
          className={`flex-1 rounded px-3 py-1 transition-colors ${
            mode === "magic" ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Lien magique
        </button>
        <button
          type="button"
          onClick={() => setMode("password")}
          className={`flex-1 rounded px-3 py-1 transition-colors ${
            mode === "password" ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Mot de passe
        </button>
      </div>

      <form onSubmit={mode === "magic" ? handleMagic : handlePassword} className="space-y-2.5">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.com"
          className="okito-hairline w-full rounded-md bg-white px-3 py-2 text-[13px] outline-none transition-colors focus:border-indigo-400"
        />
        {mode === "password" && (
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            className="okito-hairline w-full rounded-md bg-white px-3 py-2 text-[13px] outline-none transition-colors focus:border-indigo-400"
          />
        )}
        <button
          type="submit"
          disabled={busy}
          className="okito-hover w-full rounded-md bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="ti ti-loader-2 animate-spin text-[13px]" aria-hidden="true" />…
            </span>
          ) : mode === "magic" ? (
            "Recevoir le lien"
          ) : (
            "Se connecter"
          )}
        </button>
        {err && (
          <div className="okito-hairline anim-fade-up rounded-md bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            {err}
          </div>
        )}
      </form>

      <p className="mt-6 text-center text-[11px] text-slate-400">
        En continuant, tu acceptes les{" "}
        <a href="/legal" className="hover:text-slate-600 hover:underline">
          CGU
        </a>
        .
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
