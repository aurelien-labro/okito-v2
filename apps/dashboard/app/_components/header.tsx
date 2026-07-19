"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentTenantId, listTenants } from "../_lib/api-client";
import { getSupabase, isSupabaseConfigured } from "../_lib/supabase";

export function Header() {
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const id = getCurrentTenantId();
    if (id) {
      listTenants()
        .then((r) => setTenantName(r.data.find((t) => t.id === id)?.name ?? null))
        .catch(() => setTenantName(null));
    }
    if (isSupabaseConfigured()) {
      getSupabase()
        .auth.getSession()
        .then(({ data }) => setEmail(data.session?.user.email ?? null))
        .catch(() => setEmail(null));
    }
  }, []);

  const initials = (email ?? "?").split("@")[0]?.slice(0, 2).toUpperCase();

  async function logout() {
    if (isSupabaseConfigured()) await getSupabase().auth.signOut();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("okito_token");
      window.location.reload();
    }
  }

  return (
    <header className="okito-hairline-b flex items-center justify-between bg-white px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-md bg-black text-xs font-medium text-white">
          O
        </div>
        <span className="text-sm font-semibold tracking-tight">OKITO</span>
        {tenantName && <span className="text-xs text-slate-400">· {tenantName}</span>}
      </div>
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
