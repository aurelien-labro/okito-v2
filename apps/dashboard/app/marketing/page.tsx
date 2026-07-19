"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type Campaign,
  type CampaignChannel,
  type CampaignSegment,
  createCampaign,
  deleteCampaignDraft,
  getCurrentTenantId,
  getSegmentCounts,
  listCampaigns,
  sendCampaign,
} from "../_lib/api-client";

const SEGMENT_LABEL: Record<CampaignSegment, string> = {
  all: "Tous les clients",
  regulars: "Habitués (3+ visites)",
  recent: "Venus < 30 jours",
  dormant: "Dormants (> 60 jours)",
};

const CHANNEL_LABEL: Record<CampaignChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
};

export default function MarketingPage() {
  return (
    <LoginGate>
      <Marketing />
    </LoginGate>
  );
}

function Marketing() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [counts, setCounts] = useState<Record<CampaignSegment, number> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const reload = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    try {
      const [camps, segs] = await Promise.all([
        listCampaigns(tenantId),
        getSegmentCounts(tenantId),
      ]);
      setCampaigns(camps.data);
      setCounts(segs.data);
      setErr(null);
    } catch (e) {
      if ((e as { status?: number }).status === 404) setUnavailable(true);
      else setErr(e instanceof Error ? e.message : "Chargement impossible");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleSend(c: Campaign) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    const count = counts?.[c.segment] ?? 0;
    if (!confirm(`Envoyer « ${c.name} » en ${CHANNEL_LABEL[c.channel]} à ~${count} client(s) ?`))
      return;
    try {
      await sendCampaign(tenantId, c.id);
      await reload();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  async function handleDelete(c: Campaign) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    if (!confirm(`Supprimer le brouillon « ${c.name} » ?`)) return;
    try {
      await deleteCampaignDraft(tenantId, c.id);
      await reload();
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  if (unavailable) {
    return (
      <div className="p-8 text-sm text-slate-500">
        Module marketing non monté côté API (redémarrer l&apos;API après mise à jour).
      </div>
    );
  }

  return (
    <div>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Campagnes email et WhatsApp vers des segments calculés depuis les réservations. Utilise{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">{"{prenom}"}</code> pour
          personnaliser.
        </p>
      </header>

      {err && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {counts && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(Object.keys(SEGMENT_LABEL) as CampaignSegment[]).map((s) => (
            <div key={s} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-2xl font-semibold">{counts[s]}</div>
              <div className="mt-1 text-xs text-slate-500">{SEGMENT_LABEL[s]}</div>
            </div>
          ))}
        </div>
      )}

      <CreateCampaignForm counts={counts} onCreated={reload} />

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {campaigns.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Aucune campagne pour l&apos;instant.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nom</th>
                <th className="px-4 py-3 text-left font-medium">Canal</th>
                <th className="px-4 py-3 text-left font-medium">Segment</th>
                <th className="px-4 py-3 text-left font-medium">Statut</th>
                <th className="px-4 py-3 text-left font-medium">Envois</th>
                <th className="px-4 py-3 text-left font-medium">—</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">{CHANNEL_LABEL[c.channel]}</td>
                  <td className="px-4 py-3 text-slate-600">{SEGMENT_LABEL[c.segment]}</td>
                  <td className="px-4 py-3">
                    {c.status === "sent" ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        Envoyée
                        {c.sentAt ? ` le ${new Date(c.sentAt).toLocaleDateString("fr-FR")}` : ""}
                      </span>
                    ) : (
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                        Brouillon
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.status === "sent"
                      ? `${c.sentCount}/${c.recipientCount}${c.failedCount ? ` (${c.failedCount} échec${c.failedCount > 1 ? "s" : ""})` : ""}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "draft" && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleSend(c)}
                          className="text-xs font-medium text-indigo-700 hover:underline"
                        >
                          Envoyer
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          className="text-xs text-rose-700 hover:underline"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
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

function CreateCampaignForm({
  counts,
  onCreated,
}: {
  counts: Record<CampaignSegment, number> | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CampaignChannel>("email");
  const [segment, setSegment] = useState<CampaignSegment>("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    setBusy(true);
    setErr(null);
    try {
      await createCampaign(tenantId, {
        name: name.trim(),
        channel,
        segment,
        subject: channel === "email" ? subject.trim() : null,
        body: body.trim(),
      });
      setName("");
      setSubject("");
      setBody("");
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Nouvelle campagne</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Nom *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Relance clients dormants"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Canal</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as CampaignChannel)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Segment</span>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value as CampaignSegment)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {(Object.keys(SEGMENT_LABEL) as CampaignSegment[]).map((s) => (
              <option key={s} value={s}>
                {SEGMENT_LABEL[s]}
                {counts ? ` — ${counts[s]}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {channel === "email" && (
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Sujet *</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            placeholder="On ne vous a pas vu depuis un moment…"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      )}
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-slate-700">Message *</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={4}
          placeholder={"Bonjour {prenom}, …"}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
      <div className="mt-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Création…" : "Créer le brouillon"}
        </button>
      </div>
    </form>
  );
}
