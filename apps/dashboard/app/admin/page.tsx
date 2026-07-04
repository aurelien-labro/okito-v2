"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type Invoice,
  type InvoiceLine,
  type InvoiceStatus,
  cancelInvoice,
  createInvoice,
  getCurrentTenantId,
  listInvoices,
  markInvoicePaid,
  sendInvoice,
} from "../_lib/api-client";

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  paid: "Payée",
  overdue: "En retard",
  cancelled: "Annulée",
};

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: "bg-stone-200 text-stone-700",
  sent: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  overdue: "bg-rose-100 text-rose-800",
  cancelled: "bg-stone-200 text-stone-500",
};

function euros(cents: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

export default function AdminPage() {
  return (
    <LoginGate>
      <AdminView />
    </LoginGate>
  );
}

function AdminView() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState<InvoiceStatus | "all">("all");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      setErr("Aucun tenant sélectionné.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await listInvoices(tenantId, filter === "all" ? undefined : filter);
      setRows(res.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur chargement");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function act(fn: (t: string, id: string) => Promise<unknown>, id: string) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    try {
      await fn(tenantId, id);
      await fetchData();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  const totals = summarize(rows);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Admin — Factures</h1>
        <p className="mt-1 text-sm text-stone-500">
          Émets tes factures ; Jarvis relance automatiquement les impayés (tu peux annuler pendant
          24 h).
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Encaissé" value={euros(totals.paid, "EUR")} />
        <Stat label="En attente" value={euros(totals.pending, "EUR")} />
        <Stat label="En retard" value={euros(totals.overdue, "EUR")} warn={totals.overdue > 0} />
        <Stat label="Factures" value={String(rows.length)} />
      </div>

      <NewInvoiceForm onCreated={fetchData} />

      <div className="mb-3 mt-6 flex items-center justify-between">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as InvoiceStatus | "all")}
          className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="all">Toutes</option>
          <option value="draft">Brouillons</option>
          <option value="sent">Envoyées</option>
          <option value="overdue">En retard</option>
          <option value="paid">Payées</option>
          <option value="cancelled">Annulées</option>
        </select>
        <button
          type="button"
          onClick={fetchData}
          className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
        >
          Recharger
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <Empty>Chargement…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Aucune facture. Crée-en une ci-dessus.</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2">Numéro</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2 text-right">Montant</th>
                <th className="px-4 py-2">Échéance</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{inv.number}</td>
                  <td className="px-4 py-3">
                    {inv.customerName}
                    {inv.remindersSent > 0 && (
                      <span className="ml-2 text-xs text-stone-400">
                        {inv.remindersSent} relance(s)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {euros(inv.amountCents, inv.currency)}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500">
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[inv.status]}`}
                    >
                      {STATUS_LABEL[inv.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <div className="flex justify-end gap-2">
                      {inv.status === "draft" && (
                        <button
                          type="button"
                          onClick={() => act(sendInvoice, inv.id)}
                          className="text-blue-700 hover:underline"
                        >
                          Émettre
                        </button>
                      )}
                      {(inv.status === "sent" || inv.status === "overdue") && (
                        <button
                          type="button"
                          onClick={() => act(markInvoicePaid, inv.id)}
                          className="text-emerald-700 hover:underline"
                        >
                          Payée
                        </button>
                      )}
                      {inv.status !== "paid" && inv.status !== "cancelled" && (
                        <button
                          type="button"
                          onClick={() => act(cancelInvoice, inv.id)}
                          className="text-stone-400 hover:underline"
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function summarize(rows: Invoice[]) {
  let paid = 0;
  let pending = 0;
  let overdue = 0;
  for (const r of rows) {
    if (r.status === "paid") paid += r.amountCents;
    else if (r.status === "sent") pending += r.amountCents;
    else if (r.status === "overdue") overdue += r.amountCents;
  }
  return { paid, pending, overdue };
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-stone-100/70 p-3">
      <div className="text-[11px] text-stone-500">{label}</div>
      <div className={`mt-1 text-lg font-medium ${warn ? "text-rose-700" : "text-stone-900"}`}>
        {value}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
      {children}
    </div>
  );
}

function NewInvoiceForm({ onCreated }: { onCreated: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    const q = Number(quantity);
    const price = Math.round(Number(unitPrice) * 100);
    if (!customerName.trim() || !label.trim() || !(q > 0) || !(price > 0)) {
      setErr("Renseigne client, libellé, quantité et prix.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const lines: InvoiceLine[] = [{ label: label.trim(), quantity: q, unitPriceCents: price }];
      await createInvoice(tenantId, {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || null,
        lines,
      });
      setCustomerName("");
      setCustomerEmail("");
      setLabel("");
      setQuantity("1");
      setUnitPrice("");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-medium">Nouvelle facture</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Client"
          className="rounded border border-stone-300 px-3 py-1.5 text-sm"
        />
        <input
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          placeholder="Email (pour relance)"
          className="rounded border border-stone-300 px-3 py-1.5 text-sm"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Prestation"
          className="rounded border border-stone-300 px-3 py-1.5 text-sm"
        />
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          type="number"
          min="1"
          placeholder="Qté"
          className="rounded border border-stone-300 px-3 py-1.5 text-sm"
        />
        <input
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          type="number"
          min="0"
          step="0.01"
          placeholder="Prix unit. (€)"
          className="rounded border border-stone-300 px-3 py-1.5 text-sm"
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Création…" : "Créer le brouillon"}
        </button>
        {err && <span className="text-sm text-rose-700">{err}</span>}
      </div>
    </div>
  );
}
