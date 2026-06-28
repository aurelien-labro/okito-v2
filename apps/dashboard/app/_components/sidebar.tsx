"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Vue d'ensemble" },
  { href: "/reservations", label: "Réservations" },
  { href: "/tenants", label: "Tenants" },
  { href: "/audit", label: "Audit" },
  { href: "/stats", label: "Statistiques" },
  { href: "/settings", label: "Paramètres" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 border-r border-stone-200 bg-white px-4 py-6">
      <div className="mb-8 px-2">
        <div className="text-sm font-semibold tracking-tight">OKITO</div>
        <div className="text-xs text-stone-500">Dashboard</div>
      </div>
      <nav className="space-y-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "block rounded px-3 py-2 text-sm font-medium bg-stone-900 text-white"
                  : "block rounded px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
