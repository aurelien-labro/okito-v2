"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AuthGate, SessionSync } from "./auth-shell";
import { Header } from "./header";
import { LandingHeader } from "./landing-header";
import { Sidebar } from "./sidebar";

// Routes publiques : landing, pricing, welcome (target OAuth), legal.
// Tout le reste = privé et passe par l'AuthGate.
const PUBLIC_PREFIXES = ["/pricing", "/legal", "/welcome"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function Chrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const publicRoute = isPublic(pathname);

  return (
    <>
      {/* SessionSync est globalement monté : il capte le callback OAuth
          même sur les routes publiques (welcome), et pousse le token en
          localStorage pour api-client. */}
      <SessionSync />
      {publicRoute ? (
        <div key={pathname} className="anim-fade-in flex min-h-screen flex-col">
          <LandingHeader />
          <main className="flex-1">{children}</main>
        </div>
      ) : (
        <AuthGate>
          <div className="flex min-h-screen flex-col">
            <Header />
            <div className="flex min-h-0 flex-1">
              <Sidebar />
              <main key={pathname} className="anim-fade-in flex-1 overflow-y-auto px-6 py-6">
                {children}
              </main>
            </div>
          </div>
        </AuthGate>
      )}
    </>
  );
}
