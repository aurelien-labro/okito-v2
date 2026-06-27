import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "./_components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "OKITO — Dashboard",
  description: "Gestion des réservations OKITO",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-stone-50 text-stone-900">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 px-8 py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
