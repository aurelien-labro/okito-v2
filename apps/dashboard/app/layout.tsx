import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "./_components/header";
import { Sidebar } from "./_components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "OKITO — Dashboard",
  description: "L'OS de ton commerce, piloté par Jarvis",
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
        <div className="flex min-h-screen flex-col">
          <Header />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
