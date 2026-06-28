-- =====================================================
-- OKITO V2 — Migration 0012
-- Liste d'attente : quand un créneau est plein, on propose au client
-- de rejoindre la waitlist. Si désistement plus tard, on notifie
-- automatiquement les entries pertinentes par ordre d'inscription.
-- =====================================================

create table if not exists waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  couverts integer not null check (couverts >= 1 and couverts <= 50),

  date_souhaitee date not null,
  heure_souhaitee time not null,
  -- Tolérance : ±30 min par défaut, configurable plus tard
  flex_minutes integer not null default 30,

  status text not null default 'waiting'
    check (status in ('waiting', 'notified', 'converted', 'expired', 'cancelled')),

  -- Quand on a notifié le client qu'un créneau s'est libéré
  notified_at timestamptz,
  -- Quand le client a converti en résa effective
  converted_at timestamptz,
  -- Quand la fenêtre est passée sans conversion (auto-expire)
  expired_at timestamptz,

  notes text,

  created_at timestamptz not null default now()
);

create index if not exists waitlist_tenant_status_idx
  on waitlist_entries (tenant_id, status, date_souhaitee)
  where status = 'waiting';

create index if not exists waitlist_phone_idx
  on waitlist_entries (tenant_id, customer_phone);
