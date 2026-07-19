"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type Tenant,
  activateTenant,
  createTenant,
  listTenants,
  suspendTenant,
} from "../_lib/api-client";

const INDUSTRIES = ["restaurant", "hotel", "garage", "beauty", "realestate", "rental", "generic"];

export default function TenantsPage() {
  return (
    <LoginGate>
      <TenantsList />
    </LoginGate>
  );
}

function TenantsList() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await listTenants();
      setTenants(res.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function toggleStatus(t: Tenant) {
    try {
      if (t.status === "active") {
        await suspendTenant(t.id);
      } else {
        await activateTenant(t.id);
      }
      reload();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="mt-1 text-sm text-slate-500">Gestion multi-tenant — admin uniquement.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {showForm ? "Annuler" : "Nouveau tenant"}
        </button>
      </header>

      {err && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {showForm && (
        <CreateTenantForm
          tenants={tenants}
          onSuccess={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement…</div>
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Aucun tenant.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nom</th>
                <th className="px-4 py-3 text-left font-medium">Slug</th>
                <th className="px-4 py-3 text-left font-medium">Vertical</th>
                <th className="px-4 py-3 text-left font-medium">Groupe</th>
                <th className="px-4 py-3 text-left font-medium">Statut</th>
                <th className="px-4 py-3 text-left font-medium">Capacité</th>
                <th className="px-4 py-3 text-left font-medium">—</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{t.slug}</code>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-600">
                      {t.industry}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {t.parentTenantId
                      ? (tenants.find((p) => p.id === t.parentTenantId)?.name ?? "—")
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3">{t.capacityMax}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/tenants/${t.id}`}
                        className="text-xs text-slate-700 hover:underline"
                      >
                        Éditer
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleStatus(t)}
                        className="text-xs text-slate-700 hover:underline"
                      >
                        {t.status === "active" ? "Suspendre" : "Activer"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CreateTenantForm({
  tenants,
  onSuccess,
}: {
  tenants: Tenant[];
  onSuccess: () => void;
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("restaurant");
  const [contactEmail, setContactEmail] = useState("");
  const [parentTenantId, setParentTenantId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      await createTenant({
        slug: slug.trim(),
        name: name.trim(),
        industry,
        contactEmail: contactEmail.trim() || null,
        parentTenantId: parentTenantId || null,
      });
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur création");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Nouveau tenant</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Slug *">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            pattern="[a-z0-9-]+"
            placeholder="bistrot-de-paul"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Nom commercial *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Bistrot de Paul"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Vertical">
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Email contact">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="manager@bistrot.fr"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Groupe (rattachement)">
          <select
            value={parentTenantId}
            onChange={(e) => setParentTenantId(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Aucun — établissement indépendant</option>
            {tenants
              .filter((t) => t.parentTenantId === null)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {err && <div className="mt-4 text-sm text-red-700">{err}</div>}
      <div className="mt-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Création…" : "Créer le tenant"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status === "suspended"
        ? "bg-red-50 text-red-800 border-red-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}
