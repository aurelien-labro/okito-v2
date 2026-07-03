import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CookieBanner } from "./_components/cookie-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "OKITO — L'assistant qui prend vos réservations 24/7",
  description:
    "Bot vocal multilingue + WhatsApp + widget web pour restaurants, hôtels et services. Plus jamais une réservation ratée.",
  openGraph: {
    title: "OKITO — Réservations automatisées",
    description:
      "L'IA qui répond au téléphone, sur WhatsApp et sur votre site, à votre place, 24h/24.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-stone-50 text-stone-900 antialiased">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
