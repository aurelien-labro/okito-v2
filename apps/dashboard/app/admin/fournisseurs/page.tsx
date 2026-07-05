"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from "react";
import { LoginGate } from "../../_components/login-gate";
import {
  type SupplierInvoice,
  type SupplierInvoiceExtraction,
  type SupplierInvoiceStatus,
  createSupplierInvoice,
  extractSupplierInvoice,
  getCurrentTenantId,
  listSupplierInvoices,
  transitionSupplierInvoice,
} from "../../_lib/api-client";

const STATUS_LABEL: Record<SupplierInvoiceStatus, string> = {
  received: "Reçue",
  approved: "Approuvée",
  paid: "Payée",
  disputed: "Contestée",
  cancelled: "Annulée",
};

const STATUS_COLOR: Record<SupplierInvoiceStatus, string> = {
  received: "bg-blue-100 text-blue-800",
  approved: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  disputed: "bg-rose-100 text-rose-800",
  cancelled: "bg-stone-200 text-stone-500",
};

const ACCEPTED_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function euros(cents: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

export default function SupplierInvoicesPage() {
  return (
    <LoginGate>
      <SupplierInvoicesView />
    </LoginGate>
  );
}

interface FormState {
  supplierName: string;
  invoiceNumber: string;
  amountEuros: string;
  category: string;
  dueDate: string;
  source: "manual" | "upload";
  extracted: Record<string, unknown> | null;
  confidence: number | null;
}

const EMPTY_FORM: FormState = {
  supplierName: "",
  invoiceNumber: "",
  amountEuros: "",
  category: "",
  dueDate: "",
  source: "manual",
  extracted: null,
  confidence: null,
};

function SupplierInvoicesView() {
  const [rows, setRows] = useState<SupplierInvoice[]>([]);
  const [filter, setFilter] = useState<SupplierInvoiceStatus | "all">("all");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      setErr("Aucun tenant sélectionné.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await listSupplierInvoices(tenantId, filter === "all" ? undefined : filter);
      setRows(res.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    if (!ACCEPTED_MIMES.includes(file.type)) {
      setErr("Format non supporté — PDF, JPEG, PNG ou WebP.");
      return;
    }
    setExtracting(true);
    setErr(null);
    try {
      const dataBase64 = await toBase64(file);
      const res = await extractSupplierInvoice(tenantId, { mimeType: file.type, dataBase64 });
      applyExtraction(res.data);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Extraction impossible.");
    } finally {
      setExtracting(false);
    }
  }

  function applyExtraction(x: SupplierInvoiceExtraction) {
    setForm({
      supplierName: x.supplierName,
      invoiceNumber: x.invoiceNumber ?? "",
      amountEuros: (x.amountCents / 100).toFixed(2),
      category: x.category ?? "",
      dueDate: x.dueDate ?? "",
      source: "upload",
      extracted: x as unknown as Record<string, unknown>,
      confidence: x.confidence,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    const amountCents = Math.round(Number.parseFloat(form.amountEuros.replace(",", ".")) * 100);
    if (!form.supplierName.trim() || !Number.isFinite(amountCents) || amountCents <= 0) {
      setErr("Fournisseur et montant positif requis.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await createSupplierInvoice(tenantId, {
        supplierName: form.supplierName.trim(),
        invoiceNumber: form.invoiceNumber.trim() || null,
        amountCents,
        category: form.category.trim() || null,
        dueDate: form.dueDate ? `${form.dueDate}T00:00:00Z` : null,
        source: form.source,
        extracted: form.extracted,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchData();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Création impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function transition(
    row: SupplierInvoice,
    action: "approve" | "paid" | "dispute" | "cancel",
  ) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    try {
      await transitionSupplierInvoice(tenantId, row.id, action);
      await fetchData();
    } catch (ex) {
      alert(`Échec : ${ex instanceof Error ? ex.message : "erreur"}`);
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/admin" className="text-stone-500 hover:text-stone-800 hover:underline">
              Factures clients
            </Link>
            <span className="font-semibold text-stone-900">Fournisseurs</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Factures fournisseurs</h1>
          <p className="mt-1 text-sm text-stone-500">
            Uploade la facture (PDF ou photo) : Jarvis pré-remplit tout, tu valides. Rappel
            automatique 3 jours avant l'échéance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
            {extracting ? "Lecture par Jarvis…" : "Uploader une facture"}
            <input
              type="file"
              accept={ACCEPTED_MIMES.join(",")}
              onChange={handleFile}
              disabled={extracting}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowForm((v) => !v);
            }}
            className="rounded border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            Saisie manuelle
          </button>
        </div>
      </header>

      {err && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-lg border border-stone-200 bg-white p-4"
        >
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              {form.source === "upload"
                ? "Proposition de Jarvis — vérifie et valide"
                : "Nouvelle facture"}
            </h2>
            {form.confidence !== null && (
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
                confiance {(form.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <Field id="sup-name" label="Fournisseur *">
              <input
                id="sup-name"
                type="text"
                value={form.supplierName}
                onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field id="sup-number" label="Numéro">
              <input
                id="sup-number"
                type="text"
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field id="sup-amount" label="Montant TTC (€) *">
              <input
                id="sup-amount"
                type="text"
                inputMode="decimal"
                value={form.amountEuros}
                onChange={(e) => setForm({ ...form, amountEuros: e.target.value })}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field id="sup-category" label="Catégorie">
              <input
                id="sup-category"
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="matières premières…"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field id="sup-due" label="Échéance">
              <input
                id="sup-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Ajouter la facture"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 flex gap-1">
        {(["all", "received", "approved", "paid", "disputed", "cancelled"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === s
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {s === "all" ? "Toutes" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr>
              <th className="px-4 py-2">Fournisseur</th>
              <th className="px-4 py-2">Numéro</th>
              <th className="px-4 py-2">Montant</th>
              <th className="px-4 py-2">Catégorie</th>
              <th className="px-4 py-2">Échéance</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-stone-500">
                  Chargement…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-stone-500">
                  Aucune facture fournisseur.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-stone-100">
                  <td className="px-4 py-2 font-medium">{row.supplierName}</td>
                  <td className="px-4 py-2 text-stone-500">{row.invoiceNumber ?? "—"}</td>
                  <td className="px-4 py-2">{euros(row.amountCents, row.currency)}</td>
                  <td className="px-4 py-2 text-stone-500">{row.category ?? "—"}</td>
                  <td className="px-4 py-2 text-stone-500">
                    {row.dueDate ? new Date(row.dueDate).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[row.status]}`}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-stone-400">
                    {row.source === "upload"
                      ? "Jarvis"
                      : row.source === "email"
                        ? "Email"
                        : "Manuel"}
                  </td>
                  <td className="px-4 py-2 text-right text-xs">
                    {row.status === "received" && (
                      <button
                        type="button"
                        onClick={() => transition(row, "approve")}
                        className="mr-3 text-amber-700 hover:underline"
                      >
                        Approuver
                      </button>
                    )}
                    {(row.status === "received" || row.status === "approved") && (
                      <>
                        <button
                          type="button"
                          onClick={() => transition(row, "paid")}
                          className="mr-3 text-emerald-700 hover:underline"
                        >
                          Payée
                        </button>
                        <button
                          type="button"
                          onClick={() => transition(row, "dispute")}
                          className="mr-3 text-rose-700 hover:underline"
                        >
                          Contester
                        </button>
                        <button
                          type="button"
                          onClick={() => transition(row, "cancel")}
                          className="text-stone-500 hover:underline"
                        >
                          Annuler
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-500" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** Base64 sans le préfixe data:mime;base64, — c'est ce que l'API attend. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}
