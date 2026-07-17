-- =====================================================
-- OKITO V3 — Migration 0038
-- Voice cloning (vague 4) : le "digital twin" vocal du patron.
-- Un profil par tenant : le voice_id ElevenLabs du clone + la preuve de
-- consentement (qui, quand, quel texte) — obligatoire avant tout clonage.
--
-- Aucune ligne = voix par défaut du pipeline (ELEVENLABS_VOICE_ID).
-- =====================================================

create table if not exists tenant_voice_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- voice_id ElevenLabs du clone (instant voice cloning).
  voice_id text not null,
  label text not null default 'Voix du patron',

  -- Preuve de consentement : refusée côté service si absente.
  consent_given_by text not null,
  consent_text text not null,
  consent_at timestamptz not null default now(),

  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id)
);

alter table tenant_voice_profiles enable row level security;
