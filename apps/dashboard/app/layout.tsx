import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Chrome } from "./_components/chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "OKITO — L'OS de ton commerce",
  description: "Jarvis prend en charge ton quotidien : avis, réservations, factures, marketing.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css"
        />
      </head>
      <body className="bg-white text-slate-900">
        <Chrome>{children}</Chrome>
      </body>
    </html>
  );
}
