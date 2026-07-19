"use client";

import type { ReactNode } from "react";

/**
 * DEPRECATED — la gate est maintenant globale via `AuthGate` monté dans
 * `chrome.tsx`. Ce composant reste comme no-op pour éviter de casser toutes
 * les pages qui l'importaient (`<LoginGate>...</LoginGate>`). À nettoyer
 * dans une PR de refactor dédiée.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
