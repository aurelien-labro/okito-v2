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

// Skills : capacités transverses portées par Jarvis (séparées des Modules
// pour matérialiser leur nature « agents autonomes » face aux modules-outils).
const SKILLS: NavItem[] = [
  { href: "/coach", label: "Coach quotidien", icon: "ti-run" },
  { href: "/social", label: "Social auto-piloté", icon: "ti-brand-instagram" },
  { href: "/forecast", label: "Prévisions & staffing", icon: "ti-trending-up" },
  { href: "/radar", label: "Radar concurrence", icon: "ti-radar-2" },
];

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
  { href: "/connectors", label: "Connecteurs", icon: "ti-puzzle" },
  { href: "/site", label: "Site web", icon: "ti-world" },
];

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
    <aside className="okito-hairline-r flex w-52 flex-col bg-white px-2.5 py-3">
      <div className="mb-3 px-1.5">
        <TenantSwitcher />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {TOP.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <SectionLabel>Skills</SectionLabel>
        {SKILLS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} soon />
        ))}

        <SectionLabel>Modules</SectionLabel>
        {MODULES.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <SectionLabel>Administration</SectionLabel>
        {ADMIN.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
    </aside>
  );
}

function NavLink({ item, active, soon }: { item: NavItem; active: boolean; soon?: boolean }) {
  return (
    <Link
      href={item.href}
      className={
        active
          ? "flex items-center gap-2.5 rounded-[12px] bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700"
          : "flex items-center gap-2.5 rounded-[12px] px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      }
    >
      <span className={`ti ${item.icon} text-[15px]`} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      {soon && (
        <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
          bientôt
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-4 text-[10px] font-medium uppercase tracking-wide text-slate-400">
      {children}
    </div>
  );
}
