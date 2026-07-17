-- =====================================================
-- OKITO V3 — Migration 0037
-- Boutique d'automatisations Jarvis (vague 4, marketplace interne v1) :
-- le patron active/désactive chaque boucle autonome et peut durcir ou
-- assouplir sa politique (auto / annulable / validation) par tenant.
--
-- Aucune ligne = comportement par défaut (tool actif, policy du code).
-- =====================================================

create table if not exists jarvis_tool_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- Type d'action Jarvis ("review.reply", "invoice.remind"…).
  tool_type text not null,
  enabled boolean not null default true,
  -- Politique forcée par le patron (null = défaut du code).
  policy_override text check (policy_override in ('auto', 'auto_cancellable', 'approval')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, tool_type)
);

create index if not exists jarvis_tool_settings_tenant_idx on jarvis_tool_settings(tenant_id);

alter table jarvis_tool_settings enable row level security;
