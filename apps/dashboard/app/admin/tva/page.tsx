"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../../_components/login-gate";
import { type VatReport, getCurrentTenantId, getVatReport } from "../../_lib/api-client";

function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function rateLabel(bps: number): string {
  return `${(bps / 100).toLocaleString("fr-FR")} %`;
}

const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export default function VatPage() {
  return (
    <LoginGate>
      <VatView />
    </LoginGate>
  );
}

function VatView() {
  const now = new Date();
  // Par défaut : le mois précédent (celui qu'on déclare).
  const defaultDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [year, setYear] = useState(defaultDate.getFullYear());
  const [month, setMonth] = useState(defaultDate.getMonth() + 1);
  const [report, setReport] = useState<VatReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      setErr("Aucun tenant sélectionné.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await getVatReport(tenantId, year, month);
      setReport(res.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Chargement impossible.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    if (!report) return;
    const rows: string[][] = [
      ["Rapport TVA", `${MONTHS[report.period.month - 1]} ${report.period.year}`],
      [],
      ["Section", "Taux", "Nb factures", "TTC", "HT", "TVA"],
      ...report.sales.lines.map((l) => [
        "Ventes (collectée)",
        rateLabel(l.rateBps),
        String(l.count),
        (l.grossCents / 100).toFixed(2),
        (l.netCents / 100).toFixed(2),
        (l.vatCents / 100).toFixed(2),
      ]),
      ...report.purchases.lines.map((l) => [
        "Achats (déductible)",
        rateLabel(l.rateBps),
        String(l.count),
        (l.grossCents / 100).toFixed(2),
        (l.netCents / 100).toFixed(2),
        (l.vatCents / 100).toFixed(2),
      ]),
      [],
      ["TVA collectée", "", "", "", "", (report.sales.totalVatCents / 100).toFixed(2)],
      ["TVA déductible", "", "", "", "", (report.purchases.totalVatCents / 100).toFixed(2)],
      [
        report.netVatCents >= 0 ? "TVA nette à reverser" : "Crédit de TVA",
        "",
        "",
        "",
        "",
        (Math.abs(report.netVatCents) / 100).toFixed(2),
      ],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tva-${report.period.year}-${String(report.period.month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/admin" className="text-slate-500 hover:text-slate-800 hover:underline">
            Factures clients
          </Link>
          <Link
            href="/admin/fournisseurs"
            className="text-slate-500 hover:text-slate-800 hover:underline"
          >
            Fournisseurs
          </Link>
          <span className="font-semibold text-slate-900">TVA</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Préparation TVA</h1>
        <p className="mt-1 text-sm text-slate-500">
          Régime des encaissements : factures clients encaissées et factures fournisseurs payées sur
          le mois.
        </p>
      </div>

      <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="ti ti-alert-triangle mr-1" aria-hidden="true" />
        Ceci est une <strong>préparation</strong> à faire valider par ton comptable — pas une
        déclaration. La télédéclaration reste de son ressort.
      </div>

      <div className="mb-5 flex items-center gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!report}
          className="ml-auto rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Exporter CSV
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Calcul…
        </div>
      ) : report ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard label="TVA collectée (ventes)" cents={report.sales.totalVatCents} />
            <SummaryCard label="TVA déductible (achats)" cents={report.purchases.totalVatCents} />
            <SummaryCard
              label={report.netVatCents >= 0 ? "TVA nette à reverser" : "Crédit de TVA"}
              cents={Math.abs(report.netVatCents)}
              highlight
            />
          </div>

          <VatTable title="Ventes — TVA collectée" lines={report.sales.lines} />
          <VatTable title="Achats — TVA déductible" lines={report.purchases.lines} />
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  cents,
  highlight,
}: {
  label: string;
  cents: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{euros(cents)}</div>
    </div>
  );
}

function VatTable({ title, lines }: { title: string; lines: VatReport["sales"]["lines"] }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">Taux</th>
              <th className="px-4 py-2">Factures</th>
              <th className="px-4 py-2 text-right">TTC</th>
              <th className="px-4 py-2 text-right">HT</th>
              <th className="px-4 py-2 text-right">TVA</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Rien sur cette période.
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.rateBps} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{rateLabel(l.rateBps)}</td>
                  <td className="px-4 py-2 text-slate-500">{l.count}</td>
                  <td className="px-4 py-2 text-right">{euros(l.grossCents)}</td>
                  <td className="px-4 py-2 text-right">{euros(l.netCents)}</td>
                  <td className="px-4 py-2 text-right font-medium">{euros(l.vatCents)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
