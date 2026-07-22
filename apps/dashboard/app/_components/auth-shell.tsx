"use client";

import type { Session } from "@supabase/supabase-js";
import { type ReactNode, useEffect, useState } from "react";
import {
  clearToken,
  getCurrentTenantId,
  listAccessibleTenants,
  setCurrentTenantId,
  setToken,
} from "../_lib/api-client";
import { getSupabase, isSupabaseConfigured } from "../_lib/supabase";
import { CreateBusinessForm } from "./create-business-form";
import { LoginForm } from "./login-form";

/**
 * Auth shell global : monté au-dessus du Chrome pour les routes privées.
 *
 * Rôle :
 *  - Synchronise la session Supabase (browser client + OAuth callback URL)
 *    avec le token stocké dans localStorage utilisé par api-client.
 *  - Initialise le tenant courant via listAccessibleTenants (marche pour
 *    tous les rôles, pas seulement admin).
 *  - Si pas de session sur une route privée → login form plein écran, aucun
 *    pixel du dashboard ne fuit en arrière-plan.
 *
 * Les routes publiques (landing, pricing, welcome) ne montent pas cet
 * auth-shell (voir chrome.tsx) — /welcome est publique parce que c'est le
 * redirect target du OAuth ; le SessionSync ci-dessous s'active quand
 * même globalement pour capter le callback.
 */

async function ensureCurrentTenant(): Promise<void> {
  if (getCurrentTenantId()) return;
  try {
    const { data } = await listAccessibleTenants();
    const first = data[0];
    if (first) {
      setCurrentTenantId(first.id);
      window.dispatchEvent(new Event("okito:tenant-change"));
    }
  } catch {
    // silent — l'utilisateur n'a peut-être aucun tenant accessible
  }
}

/**
 * SessionSync : composant sans UI qui écoute les changements d'auth Supabase
 * (y compris ceux déclenchés par le parsing du callback OAuth dans l'URL)
 * et push le access_token dans okito_token. Monté globalement dans le
 * layout, actif sur toutes les routes (privées ET publiques).
 */
export function SessionSync() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const sb = getSupabase();
    sb.auth.getSession().then(async ({ data }) => {
      if (data.session?.access_token) {
        setToken(data.session.access_token);
        await ensureCurrentTenant();
      }
    });
    const { data: sub } = sb.auth.onAuthStateChange(async (_e, sess) => {
      if (sess?.access_token) {
        setToken(sess.access_token);
        await ensureCurrentTenant();
      } else {
        clearToken();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return null;
}

/**
 * AuthGate : blocage total. Rend children uniquement si session valide.
 * Sinon rend le login form plein écran — le dashboard n'existe pas en DOM.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [ssrConfigured] = useState(() => isSupabaseConfigured());
  // null = pas encore vérifié ; true = au moins un tenant accessible.
  const [hasTenant, setHasTenant] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ssrConfigured) {
      setReady(true);
      return;
    }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, [ssrConfigured]);

  // Nouvel inscrit : session OK mais aucun établissement → écran de création.
  useEffect(() => {
    if (!session) {
      setHasTenant(null);
      return;
    }
    if (getCurrentTenantId()) {
      setHasTenant(true);
      return;
    }
    let cancelled = false;
    listAccessibleTenants()
      .then(({ data }) => {
        if (cancelled) return;
        if (data[0]) {
          setCurrentTenantId(data[0].id);
          setHasTenant(true);
        } else {
          setHasTenant(false);
        }
      })
      .catch(() => {
        // API injoignable : on laisse passer, les écrans gèrent leurs erreurs.
        if (!cancelled) setHasTenant(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!ready) return <SplashScreen />;

  if (!ssrConfigured) {
    // Mode dev sans Supabase : on laisse passer avec un bandeau visible ailleurs.
    return <>{children}</>;
  }

  if (!session) return <LoginScreen />;

  if (hasTenant === null) return <SplashScreen />;

  if (hasTenant === false) {
    return (
      <div className="anim-fade-in fixed inset-0 z-40 flex items-center justify-center bg-[var(--okito-bg)] px-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{
            background:
              "radial-gradient(560px 300px at 50% 18%, rgba(79,70,229,0.07), transparent 70%)",
          }}
        />
        <div className="anim-fade-up okito-hairline relative w-full max-w-sm rounded-2xl bg-white/85 p-7 shadow-[0_6px_24px_-8px_rgba(10,10,11,0.10),0_2px_6px_rgba(10,10,11,0.04)] backdrop-blur">
          <CreateBusinessForm onCreated={() => setHasTenant(true)} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function SplashScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--okito-bg)]">
      <div className="flex items-center gap-2 text-slate-400">
        <span className="ti ti-loader-2 animate-spin text-[16px]" aria-hidden="true" />
        <span className="text-[12px]">Chargement…</span>
      </div>
    </div>
  );
}

function LoginScreen() {
  return (
    <div className="anim-fade-in fixed inset-0 z-40 flex items-center justify-center bg-[var(--okito-bg)] px-6">
      {/* Halo violet signature de la vitrine, très discret. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(560px 300px at 50% 18%, rgba(79,70,229,0.07), transparent 70%)",
        }}
      />
      <div className="anim-fade-up okito-hairline relative w-full max-w-sm rounded-2xl bg-white/85 p-7 shadow-[0_6px_24px_-8px_rgba(10,10,11,0.10),0_2px_6px_rgba(10,10,11,0.04)] backdrop-blur">
        <LoginForm />
      </div>
    </div>
  );
}
