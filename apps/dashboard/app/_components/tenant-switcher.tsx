"use client";

import { useEffect, useState } from "react";
import {
  type AccessibleTenant,
  getCurrentTenantId,
  listAccessibleTenants,
  listTenants,
  setCurrentTenantId,
} from "../_lib/api-client";

/**
 * Sélecteur d'établissement courant.
 * - Essaie d'abord /v1/tenants/accessible (membre : son établissement + ceux
 *   de son groupe s'il en est owner).
 * - Repli sur la liste admin complète (admin global).
 * - Groupé par tenant « groupe » (multi-établissements) via optgroup.
 * - Reload la page après switch pour rafraîchir toutes les données.
 *
 * Caché si l'utilisateur n'a accès qu'à 1 établissement (ou aucun).
 */
export function TenantSwitcher() {
  const [tenants, setTenants] = useState<AccessibleTenant[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    setCurrentId(getCurrentTenantId());
    (async () => {
      try {
        const res = await listAccessibleTenants();
        if (res.data.length > 1) {
          setTenants(res.data);
          return;
        }
      } catch {
        // Route non montée ou pas de membership — on tente la liste admin.
      }
      try {
        const res = await listTenants();
        setTenants(
          res.data.map((t) => ({
            id: t.id,
            slug: t.slug,
            name: t.name,
            parentTenantId: t.parentTenantId ?? null,
          })),
        );
      } catch {
        // Pas admin non plus — sélecteur caché.
        setTenants([]);
      }
    })();
  }, []);

  if (tenants.length <= 1) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setCurrentTenantId(id);
    setCurrentId(id);
    window.location.reload();
  }

  const byId = new Map(tenants.map((t) => [t.id, t]));
  // Groupes = tenants référencés comme parent (même s'ils sont hors liste).
  const groupIds = new Set(
    tenants.map((t) => t.parentTenantId).filter((id): id is string => id !== null),
  );
  const standalone = tenants.filter((t) => t.parentTenantId === null && !groupIds.has(t.id));
  const groups = [...groupIds].map((gid) => ({
    id: gid,
    name: byId.get(gid)?.name ?? "Groupe",
    parent: byId.get(gid) ?? null,
    children: tenants.filter((t) => t.parentTenantId === gid),
  }));

  return (
    <div className="mb-6 border-b border-stone-200 pb-4">
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-stone-500">
          Établissement actif
        </span>
        <select
          value={currentId ?? ""}
          onChange={handleChange}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          {standalone.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          {groups.map((g) => (
            <optgroup key={g.id} label={`Groupe ${g.name}`}>
              {g.parent && <option value={g.parent.id}>{g.parent.name} (vue groupe)</option>}
              {g.children.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}
