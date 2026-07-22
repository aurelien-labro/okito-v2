import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CookieBanner } from "./_components/cookie-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "OKITO — Jarvis pour commerçants",
  description:
    "OKITO lit vos avis, e-mails et factures. Jarvis rédige, relance, extrait — et vous laisse 24 h pour annuler avant d'agir.",
  openGraph: {
    title: "OKITO — Jarvis pour commerçants",
    description:
      "Le copilote autonome des commerces qui n'ont pas d'assistant. Rien ne part sans que vous puissiez dire non.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
