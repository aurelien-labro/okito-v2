"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TenantSwitcher } from "./tenant-switcher";

type NavItem = { href: string; label: string; icon: string };

const TOP: NavItem[] = [
  { href: "/", label: "Vue globale", icon: "ti-layout-dashboard" },
  { href: "/jarvis", label: "Jarvis", icon: "ti-sparkles" },
  { href: "/onboarding", label: "Diagnostic", icon: "ti-stethoscope" },
];

// Modules du produit : ce qui existe aujourd'hui dans OKITO V2/V3. Les cases
// à venir (Inbox, Site web, Admin, Marketing) sont grisées comme repères de roadmap.
const MODULES: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: "ti-inbox" },
  { href: "/reservations", label: "Agenda", icon: "ti-calendar" },
  { href: "/loyalty", label: "Clients", icon: "ti-users" },
  { href: "/admin", label: "Admin", icon: "ti-file-invoice" },
  { href: "/integrations", label: "Intégrations", icon: "ti-plug" },
  { href: "/waitlist", label: "Liste d'attente", icon: "ti-hourglass" },
  { href: "/service-catalog", label: "Prestations", icon: "ti-list-details" },
  { href: "/schedule", label: "Horaires", icon: "ti-clock" },
  { href: "/tables", label: "Tables", icon: "ti-armchair" },
  { href: "/marketing", label: "Marketing", icon: "ti-speakerphone" },
  { href: "/voice", label: "Voix", icon: "ti-microphone" },
  { href: "/site", label: "Site web", icon: "ti-world" },
];

const COMING: { label: string; icon: string }[] = [];

const ADMIN: NavItem[] = [
  { href: "/tenants", label: "Tenants", icon: "ti-building-store" },
  { href: "/members", label: "Membres", icon: "ti-user-cog" },
  { href: "/stats", label: "Statistiques", icon: "ti-chart-bar" },
  { href: "/audit", label: "Audit", icon: "ti-history" },
  { href: "/settings", label: "Paramètres", icon: "ti-settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="flex w-52 flex-col border-r border-stone-200 bg-stone-50/60 px-2.5 py-3">
      <div className="mb-3 px-1.5">
        <TenantSwitcher />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {TOP.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <SectionLabel>Modules</SectionLabel>
        {MODULES.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
        {COMING.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2.5 rounded px-3 py-1.5 text-sm text-stone-300"
            title="Bientôt disponible"
          >
            <span className={`ti ${item.icon} text-[15px]`} aria-hidden="true" />
            {item.label}
            <span className="ml-auto rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-400">
              bientôt
            </span>
          </div>
        ))}

        <SectionLabel>Administration</SectionLabel>
        {ADMIN.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={
        active
          ? "flex items-center gap-2.5 rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700"
          : "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
      }
    >
      <span className={`ti ${item.icon} text-[15px]`} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-4 text-[10px] font-medium uppercase tracking-wide text-stone-400">
      {children}
    </div>
  );
}
