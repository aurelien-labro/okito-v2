"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { LoginGate } from "../_components/login-gate";
import {
  type Tenant,
  type TenantMember,
  type TenantMemberRole,
  inviteMember,
  listMembers,
  listTenants,
  removeMember,
  updateMemberRole,
} from "../_lib/api-client";

const ROLES: TenantMemberRole[] = ["owner", "manager", "staff"];
const ROLE_LABEL: Record<TenantMemberRole, string> = {
  owner: "Propriétaire",
  manager: "Manager",
  staff: "Équipe",
};
const ROLE_HINT: Record<TenantMemberRole, string> = {
  owner: "Tous droits, gère les membres",
  manager: "Config + stats + résa",
  staff: "Voir et créer des résa",
};

export default function MembersPage() {
  return (
    <LoginGate>
      <MembersView />
    </LoginGate>
  );
}

function MembersView() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    listTenants()
      .then((res) => {
        setTenants(res.data);
        if (res.data[0]) setTenantId(res.data[0].id);
      })
      .catch((e) => setErr(extractMessage(e)));
  }, []);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await listMembers(tenantId);
      setMembers(res.data);
    } catch (e) {
      setErr(extractMessage(e));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleChangeRole(memberId: string, role: TenantMemberRole) {
    try {
      await updateMemberRole(memberId, role);
      reload();
    } catch (e) {
      alert(`Échec : ${extractMessage(e)}`);
    }
  }

  async function handleRemove(member: TenantMember) {
    const label = member.invitedEmail ?? member.userId ?? "ce membre";
    if (!confirm(`Retirer ${label} du tenant ?`)) return;
    try {
      await removeMember(member.id);
      reload();
    } catch (e) {
      alert(`Échec : ${extractMessage(e)}`);
    }
  }

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
          <p className="mt-1 text-sm text-slate-500">Invite ton équipe et attribue des rôles.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowInvite((v) => !v)}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            {showInvite ? "Annuler" : "Inviter"}
          </button>
        </div>
      </header>

      {err && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {showInvite && tenantId && (
        <InviteForm
          tenantId={tenantId}
          onSuccess={() => {
            setShowInvite(false);
            reload();
          }}
        />
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement…</div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Aucun membre. Invite ton équipe pour commencer.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <Th>Identifiant</Th>
                <Th>Rôle</Th>
                <Th>Statut</Th>
                <Th>Invité le</Th>
                <Th>—</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <Td>
                    {m.invitedEmail ?? <code className="text-xs">{m.userId?.slice(0, 8)}…</code>}
                  </Td>
                  <Td>
                    <select
                      value={m.role}
                      onChange={(e) => handleChangeRole(m.id, e.target.value as TenantMemberRole)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <StatusBadge member={m} />
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {m.invitedAt ? fmtDate(m.invitedAt) : "—"}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => handleRemove(m)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Retirer
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InviteForm({
  tenantId,
  onSuccess,
}: {
  tenantId: string;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantMemberRole>("staff");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      await inviteMember({ tenantId, email: email.trim(), role });
      onSuccess();
    } catch (e) {
      setErr(extractMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handle} className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">Inviter un membre</h2>
      <p className="mt-1 text-xs text-slate-500">
        L'invité reçoit accès au tenant dès qu'il signup Supabase avec cet email.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-[2fr_1fr_auto]">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="pierre@bistrot.fr"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as TenantMemberRole)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]} — {ROLE_HINT[r]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "…" : "Inviter"}
        </button>
      </div>
      {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
    </form>
  );
}

function StatusBadge({ member }: { member: TenantMember }) {
  const accepted = !!member.acceptedAt && !!member.userId;
  const cls = accepted
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {accepted ? "Actif" : "Invité"}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

function extractMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Erreur inconnue";
}
