"use client";

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

export default function WelcomePage() {
  const [name, setName] = useState<string>("");

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined;
        const first = (meta?.full_name ?? meta?.name ?? "").split(" ")[0];
        if (first) setName(first);
      });
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <section className="text-center">
        <div className="okito-hairline anim-fade-up mx-auto mb-5 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] text-slate-600">
          <span className="ti ti-check text-[13px] text-emerald-600" aria-hidden="true" />
          Connexion réussie
        </div>
        <h1
          className="anim-fade-up text-3xl font-medium tracking-tight text-slate-900 md:text-4xl"
          style={{ animationDelay: "80ms" }}
        >
          {name ? `Bienvenue ${name}.` : "Bienvenue."}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-slate-600">
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
          className="inline-flex items-center gap-2 rounded-md bg-black px-6 py-3 text-sm font-medium text-white hover:bg-slate-800"
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
