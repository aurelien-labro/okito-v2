"use client";

import { useEffect, useState } from "react";
import {
  type Tenant,
  getCurrentTenantId,
  listTenants,
  setCurrentTenantId,
} from "../_lib/api-client";

/**
 * Sélecteur de tenant courant pour les admins multi-tenant.
 * - Charge la liste des tenants au mount.
 * - Affiche le tenant courant et permet de switcher.
 * - Reload la page après switch pour rafraîchir toutes les données.
 *
 * Caché si l'utilisateur n'a accès qu'à 1 tenant (ou aucun).
 */
export function TenantSwitcher() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    setCurrentId(getCurrentTenantId());
    listTenants()
      .then((res) => setTenants(res.data))
      .catch(() => {
        // Pas admin ou pas accès — silence, sélecteur reste caché.
        setTenants([]);
      });
  }, []);

  if (tenants.length <= 1) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setCurrentTenantId(id);
    setCurrentId(id);
    window.location.reload();
  }

  return (
    <div className="mb-6 border-b border-stone-200 pb-4">
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-stone-500">Tenant actif</span>
        <select
          value={currentId ?? ""}
          onChange={handleChange}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
