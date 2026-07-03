"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "okito_cookie_consent";

/**
 * Bandeau consentement cookies minimaliste. On ne dépose aucun cookie
 * non-essentiel avant un choix explicite (privacy-by-default). Le choix
 * est mémorisé en localStorage, pas de tracker tiers.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  function choose(value: "accepted" | "declined") {
    window.localStorage.setItem(STORAGE_KEY, value);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 px-6 py-4 text-sm text-stone-600 sm:flex-row">
        <p className="flex-1">
          On utilise uniquement les cookies nécessaires au fonctionnement du site. Aucun tracking
          publicitaire.{" "}
          <a href="/legal/privacy" className="underline hover:text-stone-900">
            En savoir plus
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("declined")}
            className="rounded border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
          >
            Refuser
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
