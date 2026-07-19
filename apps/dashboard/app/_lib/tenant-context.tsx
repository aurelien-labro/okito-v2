"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { getCurrentTenantId, setCurrentTenantId } from "./api-client";

interface TenantCtx {
  tenantId: string | null;
  setTenantId: (id: string) => void;
}

const ctx = createContext<TenantCtx | null>(null);

/**
 * Source de vérité du tenant courant côté client. Avant, chaque page relisait
 * `localStorage.getItem("okito_current_tenant_id")` à chaque render — pas
 * réactif, et impossible de re-rendre quand on switch de tenant.
 *
 * Le provider écoute l'événement `storage` (synchro entre onglets) et un
 * event custom `okito:tenant-change` (synchro même onglet).
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantIdState] = useState<string | null>(null);

  useEffect(() => {
    setTenantIdState(getCurrentTenantId());
    function onStorage(e: StorageEvent) {
      if (e.key === "okito_current_tenant_id") setTenantIdState(e.newValue);
    }
    function onLocal() {
      setTenantIdState(getCurrentTenantId());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("okito:tenant-change", onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("okito:tenant-change", onLocal);
    };
  }, []);

  const setTenantId = useCallback((id: string) => {
    setCurrentTenantId(id);
    setTenantIdState(id);
    window.dispatchEvent(new Event("okito:tenant-change"));
  }, []);

  return <ctx.Provider value={{ tenantId, setTenantId }}>{children}</ctx.Provider>;
}

/**
 * Hook qui rend le tenantId réactivement. Retourne null pendant l'hydratation
 * ou si l'utilisateur n'a aucun tenant accessible.
 */
export function useTenantId(): string | null {
  const c = useContext(ctx);
  return c?.tenantId ?? null;
}

export function useSetTenantId(): (id: string) => void {
  const c = useContext(ctx);
  return c?.setTenantId ?? (() => {});
}
