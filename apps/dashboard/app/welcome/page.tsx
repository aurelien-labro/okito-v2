"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "../_lib/supabase";

type Term = {
  word: string;
  short: string;
  long: string;
  icon: string;
};

const GLOSSARY: Term[] = [
  {
    word: "Jarvis",
    short: "Ton copilote",
    long: "L'assistant qui répond, confirme, relance et poste à ta place. Tu lui parles, il exécute.",
    icon: "ti-sparkles",
  },
  {
    word: "Skill",
    short: "Une compétence",
    long: "Un domaine où Jarvis prend la main : Coach, Social, Prévisions, Radar concurrence.",
    icon: "ti-plug",
  },
  {
    word: "Brief",
    short: "Ton point du matin",
    long: "Résumé quotidien de ce que Jarvis a fait cette nuit et ce qu'il te reste à valider.",
    icon: "ti-sun",
  },
  {
    word: "Cockpit",
    short: "Ton tableau de bord",
    long: "L'écran principal (/app) : conversation avec Jarvis à gauche, KPIs et actions à droite.",
    icon: "ti-layout-dashboard",
  },
  {
    word: "Auto-pilote",
    short: "Actions autonomes",
    long: "Ce que Jarvis exécute sans te demander (réponses aux avis 5★, confirmations résa…).",
    icon: "ti-robot",
  },
  {
    word: "À valider",
    short: "Sous ton feu vert",
    long: "Actions sensibles (posts publics, envoi de mail client) que Jarvis prépare mais n'exécute qu'après ton OK.",
    icon: "ti-shield-check",
  },
];

type CallbackState =
  | { kind: "loading"; reason: "hydrate" | "oauth" }
  | { kind: "no-supabase" }
  | { kind: "session"; session: Session }
  | { kind: "no-session" }
  | { kind: "error"; message: string };

/**
 * Détection du contexte OAuth : si l'URL contient `?code=` (PKCE) ou
 * `#access_token=` (implicit legacy), on est en pleine callback -> on
 * attend la session au lieu de rendre "no-session" immédiatement.
 */
function detectOAuthCallback(): {
  hasCode: boolean;
  errorParam: { code: string; description: string } | null;
} {
  if (typeof window === "undefined") return { hasCode: false, errorParam: null };
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#")
    ? new URLSearchParams(window.location.hash.slice(1))
    : new URLSearchParams();
  const hasCode = params.has("code") || hash.has("access_token");
  const errCode = params.get("error") ?? hash.get("error");
  const errDesc = params.get("error_description") ?? hash.get("error_description");
  return {
    hasCode,
    errorParam: errCode ? { code: errCode, description: errDesc ?? "" } : null,
  };
}

/**
 * Nettoie l'URL après auth réussie : retire ?code=... et le hash, garde
 * juste /welcome. Sinon un F5 tente de ré-échanger un code expiré.
 */
function cleanUrl(): void {
  if (typeof window === "undefined") return;
  const clean = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, "", clean);
}

export default function WelcomePage() {
  const [state, setState] = useState<CallbackState>({ kind: "loading", reason: "hydrate" });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({ kind: "no-supabase" });
      return;
    }

    const { hasCode, errorParam } = detectOAuthCallback();

    // Erreur Google explicite (access_denied, admin_policy_enforced, etc.)
    if (errorParam) {
      setState({
        kind: "error",
        message: googleErrorLabel(errorParam.code, errorParam.description),
      });
      cleanUrl();
      return;
    }

    // Si on est en pleine callback OAuth, on affiche "connexion en cours"
    // au lieu de la coquille vide pendant que Supabase parse l'URL.
    if (hasCode) setState({ kind: "loading", reason: "oauth" });

    const sb = getSupabase();

    // Timeout de sécurité : si aucune session ne se pointe en 8 s, on
    // sort de la boucle avec un message clair au lieu de tourner à l'infini.
    const timeout = setTimeout(() => {
      setState((prev) => {
        if (prev.kind === "loading") {
          return {
            kind: "error",
            message:
              "La connexion Google a expiré ou a été annulée. Réessaie depuis l'écran de connexion.",
          };
        }
        return prev;
      });
    }, 8000);

    // Écoute les changements d'auth d'abord (capte le SIGNED_IN post-callback),
    // puis interroge la session courante en fallback.
    const { data: sub } = sb.auth.onAuthStateChange((_e, sess) => {
      if (sess) {
        clearTimeout(timeout);
        cleanUrl();
        setState({ kind: "session", session: sess });
      }
    });

    sb.auth.getSession().then(({ data, error }) => {
      if (error) {
        clearTimeout(timeout);
        setState({ kind: "error", message: `Session invalide : ${error.message}` });
        return;
      }
      if (data.session) {
        clearTimeout(timeout);
        cleanUrl();
        setState({ kind: "session", session: data.session });
      } else if (!hasCode) {
        // Pas de callback en cours et pas de session -> arrivée directe
        // sur /welcome sans être connecté. On propose de retourner au login.
        clearTimeout(timeout);
        setState({ kind: "no-session" });
      }
      // Sinon hasCode=true : on attend le SIGNED_IN via onAuthStateChange.
    });

    return () => {
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  // Rendus par état
  if (state.kind === "loading") return <LoadingScreen reason={state.reason} />;
  if (state.kind === "error") return <ErrorScreen message={state.message} />;
  if (state.kind === "no-session") return <NoSessionScreen />;
  if (state.kind === "no-supabase") return <NoSupabaseScreen />;

  // session ready → welcome complet
  return <WelcomeContent session={state.session} />;
}

function googleErrorLabel(code: string, desc: string): string {
  const map: Record<string, string> = {
    access_denied: "Tu as annulé la connexion Google.",
    admin_policy_enforced:
      "Le compte Google est bloqué par une politique d'administrateur de son domaine.",
    unauthorized_client:
      "OAuth Google non autorisé pour ce domaine — vérifie la config Supabase (Auth → URL Configuration → Redirect URLs).",
    provider_email_needs_verification:
      "Ton email Google n'est pas vérifié. Vérifie-le côté Google et réessaie.",
    server_error: "Erreur serveur pendant l'échange OAuth. Réessaie dans un instant.",
  };
  return map[code] ?? desc ?? `Échec Google (${code}).`;
}

function LoadingScreen({ reason }: { reason: "hydrate" | "oauth" }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <div className="okito-brand-mark anim-scale-in mb-5 flex size-10 items-center justify-center rounded-lg text-[15px] font-medium text-white">
        O
      </div>
      <div className="anim-fade-up flex items-center gap-2 text-slate-500">
        <span className="ti ti-loader-2 animate-spin text-[15px]" aria-hidden="true" />
        <span className="text-[13px]">
          {reason === "oauth" ? "Connexion à Google en cours…" : "Chargement…"}
        </span>
      </div>
      {reason === "oauth" && (
        <p
          className="anim-fade-up mt-4 max-w-xs text-[11px] text-slate-400"
          style={{ animationDelay: "160ms" }}
        >
          On finalise l'échange sécurisé du token. Ça prend normalement moins de 2 secondes.
        </p>
      )}
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <div className="anim-scale-in mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <span className="ti ti-alert-triangle text-[19px]" aria-hidden="true" />
      </div>
      <h1 className="anim-fade-up text-xl font-medium tracking-tight text-slate-900">
        Connexion interrompue
      </h1>
      <p
        className="anim-fade-up mx-auto mt-3 max-w-sm text-[13px] text-slate-600"
        style={{ animationDelay: "80ms" }}
      >
        {message}
      </p>
      <div
        className="anim-fade-up mt-6 flex flex-wrap items-center justify-center gap-2"
        style={{ animationDelay: "160ms" }}
      >
        <Link
          href="/app"
          className="okito-hover rounded-md bg-slate-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-slate-800"
        >
          Réessayer
        </Link>
        <Link
          href="/"
          className="okito-hairline okito-hover rounded-md bg-white px-4 py-2 text-[13px] font-medium text-slate-900 hover:bg-slate-50"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}

function NoSessionScreen() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <div className="anim-scale-in mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <span className="ti ti-lock text-[19px]" aria-hidden="true" />
      </div>
      <h1 className="anim-fade-up text-xl font-medium tracking-tight text-slate-900">
        Tu n'es pas connecté
      </h1>
      <p
        className="anim-fade-up mx-auto mt-3 max-w-sm text-[13px] text-slate-600"
        style={{ animationDelay: "80ms" }}
      >
        Cette page apparaît après connexion. Pour accéder au dashboard, connecte-toi d'abord.
      </p>
      <Link
        href="/app"
        className="okito-hover anim-fade-up mt-6 inline-flex rounded-md bg-slate-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-slate-800"
        style={{ animationDelay: "160ms" }}
      >
        Aller au login
      </Link>
    </div>
  );
}

function NoSupabaseScreen() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="text-xl font-medium tracking-tight text-slate-900">Auth non configurée</h1>
      <p className="mx-auto mt-3 max-w-sm text-[13px] text-slate-600">
        Les variables <code>NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> ne sont pas injectées au build.
      </p>
    </div>
  );
}

function WelcomeContent({ session }: { session: Session }) {
  const meta = session.user.user_metadata as
    | { full_name?: string; name?: string; avatar_url?: string }
    | undefined;
  const first = (meta?.full_name ?? meta?.name ?? "").split(" ")[0] ?? "";
  const avatar = meta?.avatar_url;

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <section className="text-center">
        <div className="okito-hairline anim-fade-up mx-auto mb-5 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] text-slate-600">
          <span className="ti ti-check text-[13px] text-emerald-600" aria-hidden="true" />
          Connexion réussie
        </div>
        {avatar && (
          <img
            src={avatar}
            alt=""
            className="anim-scale-in mx-auto mb-4 size-14 rounded-full ring-1 ring-slate-200"
          />
        )}
        <h1
          className="anim-fade-up text-3xl font-medium tracking-tight text-slate-900 md:text-4xl"
          style={{ animationDelay: "80ms" }}
        >
          {first ? `Bienvenue ${first}.` : "Bienvenue."}
        </h1>
        <p
          className="anim-fade-up mx-auto mt-3 max-w-lg text-sm text-slate-600"
          style={{ animationDelay: "160ms" }}
        >
          Avant d'entrer dans ton cockpit, deux minutes pour te familiariser avec le vocabulaire
          OKITO. Ça t'évitera de te demander « c'est quoi ce truc ? » plus tard.
        </p>
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
            Le petit dictionnaire OKITO
          </div>
          <div className="text-[11px] text-slate-400">6 mots à connaître</div>
        </div>
        <div className="anim-stagger grid gap-3 md:grid-cols-2">
          {GLOSSARY.map((t) => (
            <div key={t.word} className="okito-hairline okito-hover rounded-[12px] bg-white p-4">
              <div className="flex items-start gap-3">
                <span
                  className={`ti ${t.icon} mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-[15px] text-indigo-600`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <div className="text-sm font-medium text-slate-900">{t.word}</div>
                    <div className="text-[11px] italic text-slate-400">— {t.short}</div>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{t.long}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="okito-hairline mt-10 rounded-[12px] bg-white p-5">
        <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-slate-400">
          Trois règles à retenir
        </div>
        <ul className="space-y-2.5 text-[13px] text-slate-700">
          <li className="flex gap-2.5">
            <span className="ti ti-number-1 mt-0.5 text-[14px] text-slate-400" aria-hidden="true" />
            <span>
              <b className="font-medium text-slate-900">Tu peux parler à Jarvis à la voix</b> —
              icône micro dans le cockpit, il t'entend et te répond.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="ti ti-number-2 mt-0.5 text-[14px] text-slate-400" aria-hidden="true" />
            <span>
              <b className="font-medium text-slate-900">Rien de sensible sans ton OK</b> — les
              actions publiques (avis, posts) restent « à valider » tant que tu n'as pas dit oui.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="ti ti-number-3 mt-0.5 text-[14px] text-slate-400" aria-hidden="true" />
            <span>
              <b className="font-medium text-slate-900">Tu peux te déconnecter en un clic</b> — menu
              en haut à droite, tes données restent chez nous en France.
            </span>
          </li>
        </ul>
      </section>

      <section className="mt-10 flex flex-col items-center gap-3 text-center">
        <Link
          href="/app"
          className="okito-hover inline-flex items-center gap-2 rounded-md bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-800"
        >
          Entrer dans mon cockpit
          <span className="ti ti-arrow-right text-[14px]" aria-hidden="true" />
        </Link>
        <Link
          href="/onboarding"
          className="text-[12px] text-slate-500 hover:text-slate-900 hover:underline"
        >
          Je préfère d'abord configurer mes outils (Google, Insta…)
        </Link>
      </section>
    </div>
  );
}
