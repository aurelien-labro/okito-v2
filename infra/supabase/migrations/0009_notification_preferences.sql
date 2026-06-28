-- =====================================================
-- OKITO V2 — Migration 0009
-- Préférences de notification par tenant : qui reçoit quoi, sur quel canal.
--
-- Structure JSONB (ne pas créer 12 colonnes typed) :
-- {
--   "manager": {
--     "onCreate":   { "email": true,  "whatsapp": false, "sms": false },
--     "onCancel":   { "email": true,  "whatsapp": false, "sms": false }
--   },
--   "client": {
--     "onCreate":   { "email": false, "whatsapp": true,  "sms": false },
--     "onReminder": { "email": false, "whatsapp": true,  "sms": false }
--   }
-- }
--
-- Défaut sain : manager reçoit email à chaque création, client reçoit
-- WhatsApp si numéro fourni. Reminders contrôlés par remindersEnabled
-- existant.
-- =====================================================

alter table tenants
  add column if not exists notification_preferences jsonb not null default '{
    "manager": {
      "onCreate":   { "email": true,  "whatsapp": false, "sms": false },
      "onCancel":   { "email": true,  "whatsapp": false, "sms": false }
    },
    "client": {
      "onCreate":   { "email": false, "whatsapp": true,  "sms": false },
      "onReminder": { "email": false, "whatsapp": true,  "sms": false }
    }
  }'::jsonb;

alter table tenants
  add constraint tenants_notification_preferences_is_object
    check (jsonb_typeof(notification_preferences) = 'object');
