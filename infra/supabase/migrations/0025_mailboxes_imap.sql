-- =====================================================
-- OKITO V2 — Migration 0025
-- Boîtes email multi-providers : IMAP générique + Yahoo (préréglage IMAP).
--
-- Les tokens OAuth deviennent nullables (une boîte IMAP n'en a pas) ;
-- `config` porte les réglages spécifiques au provider : host, port, user,
-- mot de passe chiffré AES-256-GCM (jamais en clair, jamais exposé par
-- l'API), et le curseur de sync (uidValidity + lastUid).
-- =====================================================

alter table tenant_mailboxes alter column access_token drop not null;
alter table tenant_mailboxes alter column refresh_token drop not null;
alter table tenant_mailboxes alter column access_token_expires_at drop not null;

alter table tenant_mailboxes add column if not exists config jsonb not null default '{}';
