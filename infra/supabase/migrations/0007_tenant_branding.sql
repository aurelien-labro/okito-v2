-- =====================================================
-- OKITO V2 — Migration 0007
-- Ajout d'une colonne branding (JSONB) sur tenants pour personnaliser
-- le widget chat sur le site du client : couleurs, logo, greeting,
-- titre, position de la bulle.
--
-- Tous les champs sont optionnels — le widget fallback sur les
-- défauts OKITO (stone-900 / "Bonjour ! Comment puis-je vous aider ?").
-- =====================================================

alter table tenants
  add column if not exists branding jsonb not null default '{}'::jsonb;

alter table tenants
  add constraint tenants_branding_is_object
    check (jsonb_typeof(branding) = 'object');
