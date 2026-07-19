"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearAllOkitoState, listAccessibleTenants } from "../_lib/api-client";
import { getSupabase, isSupabaseConfigured } from "../_lib/supabase";
import { useTenantId } from "../_lib/tenant-context";

export function Header() {
  const tenantId = useTenantId();
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId) {
      // listAccessibleTenants marche pour tous les rôles (pas juste admin).
      listAccessibleTenants()
        .then((r) => setTenantName(r.data.find((t) => t.id === tenantId)?.name ?? null))
        .catch(() => setTenantName(null));
    } else {
      setTenantName(null);
    }
    if (isSupabaseConfigured()) {
      getSupabase()
        .auth.getSession()
        .then(({ data }) => setEmail(data.session?.user.email ?? null))
        .catch(() => setEmail(null));
    }
  }, [tenantId]);

  const initials = (email ?? "?").split("@")[0]?.slice(0, 2).toUpperCase();

  async function logout() {
    if (isSupabaseConfigured()) await getSupabase().auth.signOut();
    clearAllOkitoState();
    if (typeof window !== "undefined") window.location.assign("/");
  }

  return (
    <header className="okito-hairline-b flex items-center justify-between bg-white px-4 py-2.5">
      <Link href="/app" className="flex items-center gap-2.5 group">
        <div className="okito-brand-mark flex size-7 items-center justify-center rounded-md text-xs font-medium text-white transition-transform group-hover:scale-105">
          O
        </div>
        <span className="text-sm font-semibold tracking-tight">OKITO</span>
        {tenantName && <span className="anim-fade-in text-xs text-slate-400">· {tenantName}</span>}
      </Link>
      <div className="flex items-center gap-4 text-slate-500">
        <Link href="/pricing" className="text-xs font-medium text-slate-600 hover:text-slate-900">
          Tarifs
        </Link>
        <span className="ti ti-search text-[17px]" aria-hidden="true" />
        <span className="relative">
          <span className="ti ti-bell text-[17px]" aria-hidden="true" />
          <span className="absolute -right-1 -top-0.5 size-1.5 rounded-full bg-rose-500" />
        </span>
        <button
          type="button"
          onClick={logout}
          title={email ? `${email} — se déconnecter` : "Se déconnecter"}
          className="okito-hairline flex size-7 items-center justify-center rounded-full bg-slate-50 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
