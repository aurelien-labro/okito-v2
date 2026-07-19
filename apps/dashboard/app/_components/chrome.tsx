"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Header } from "./header";
import { LandingHeader } from "./landing-header";
import { Sidebar } from "./sidebar";

// Routes publiques (sans sidebar/login). Tout le reste = app.
const PUBLIC_PREFIXES = ["/pricing", "/legal", "/welcome"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function Chrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isPublic(pathname)) {
    return (
      <div className="flex min-h-screen flex-col">
        <LandingHeader />
        <main className="flex-1">{children}</main>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
