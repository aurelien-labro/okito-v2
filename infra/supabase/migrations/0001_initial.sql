-- =====================================================
-- OKITO V2 — Migration initiale (snapshot)
-- =====================================================
-- Cette migration a déjà été appliquée manuellement sur le projet Supabase
-- EU Paris le 2026-06-22 (cadrage initial).
--
-- Elle vit dans le repo comme source de vérité versionnée. Toute évolution
-- future doit passer par une nouvelle migration `000N_*.sql` ici OU par une
-- migration générée par drizzle-kit (`pnpm --filter @okito/db migrate:gen`).
--
-- Source : projects/okito-v2/SCHEMA.sql (claude-brain).
-- Règles métier : projects/okito-v2/BUSINESS_RULES.md.
-- =====================================================

-- =====================================================
-- EXTENSIONS
-- =====================================================

create extension if not exists "uuid-ossp";

-- =====================================================
-- TABLE : tenants
-- =====================================================

create table tenants (
  id              uuid primary key default uuid_generate_v4(),
  slug            text unique not null,
  name            text not null,
  contact_email   text,
  contact_phone   text,
  timezone        text not null default 'Europe/Paris',

  capacity_max    int not null default 50 check (capacity_max > 0),

  service_lunch_start   time not null default '12:00',
  service_lunch_end     time not null default '14:30',
  service_dinner_start  time not null default '19:00',
  service_dinner_end    time not null default '22:00',

  reminders_enabled     boolean not null default true,
  reminder_hour         time not null default '09:00',

  status          text not null default 'active'
                  check (status in ('active', 'suspended', 'trial')),
  stripe_customer_id text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_tenants_slug on tenants(slug);
create index idx_tenants_status on tenants(status);

-- =====================================================
-- TABLE : reservations
-- =====================================================

create table reservations (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references tenants(id) on delete cascade,

  date_reservation  date not null,
  heure             time not null,
  couverts          int not null check (couverts between 1 and 20),

  customer_name     text not null check (length(customer_name) >= 2),
  customer_phone    text not null,
  customer_email    text,

  status            text not null default 'confirmed'
                    check (status in ('confirmed', 'cancelled', 'no_show', 'completed')),
  source            text not null default 'unknown'
                    check (source in ('web_widget', 'whatsapp', 'voice', 'manual', 'unknown')),

  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  cancelled_at      timestamptz,

  constraint uniq_active_reservation
    unique (tenant_id, customer_phone, date_reservation, heure)
);

create index idx_reservations_tenant_date
  on reservations(tenant_id, date_reservation)
  where status = 'confirmed';

create index idx_reservations_phone
  on reservations(tenant_id, customer_phone, date_reservation desc);

create index idx_reservations_creneau
  on reservations(tenant_id, date_reservation, heure)
  where status = 'confirmed';

-- =====================================================
-- TABLE : conversations
-- =====================================================

create table conversations (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,

  channel             text not null
                      check (channel in ('web_widget', 'whatsapp', 'voice', 'manual')),
  session_key         text not null,

  step                text not null default 'idle'
                      check (step in ('idle', 'collecting_intent', 'collecting_jour',
                                      'collecting_heure', 'collecting_personnes',
                                      'collecting_nom', 'confirming', 'completed', 'abandoned')),
  collected_fields    jsonb not null default '{}'::jsonb,
  messages            jsonb not null default '[]'::jsonb,

  reservation_id      uuid references reservations(id) on delete set null,

  status              text not null default 'active'
                      check (status in ('active', 'completed', 'abandoned')),

  last_message_at     timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create unique index uniq_active_session
  on conversations(tenant_id, channel, session_key)
  where status = 'active';

create index idx_conversations_tenant_session
  on conversations(tenant_id, session_key);

create index idx_conversations_last_msg
  on conversations(last_message_at desc)
  where status = 'active';

-- =====================================================
-- TABLE : tenant_phone_routes
-- =====================================================

create table tenant_phone_routes (
  id            uuid primary key default uuid_generate_v4(),
  phone_number  text unique not null,
  channel       text not null
                check (channel in ('whatsapp', 'voice')),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index idx_phone_routes_lookup
  on tenant_phone_routes(phone_number, channel);

-- =====================================================
-- FONCTIONS
-- =====================================================

create or replace function get_creneau_capacity(
  p_tenant_id uuid,
  p_date date,
  p_heure time
) returns int as $$
  select coalesce(sum(couverts), 0)::int
  from reservations
  where tenant_id = p_tenant_id
    and date_reservation = p_date
    and heure = p_heure
    and status = 'confirmed'
$$ language sql stable;

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_tenants_updated_at
  before update on tenants
  for each row execute function set_updated_at();

create trigger trg_reservations_updated_at
  before update on reservations
  for each row execute function set_updated_at();

-- =====================================================
-- ROW-LEVEL SECURITY
-- =====================================================

alter table tenants enable row level security;
alter table reservations enable row level security;
alter table conversations enable row level security;
alter table tenant_phone_routes enable row level security;

-- Le backend signe ses JWT avec un claim "tenant_id".
-- Les policies filtrent automatiquement sur ce claim.

create policy "select_own_tenant" on tenants
  for select
  using (id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

create policy "update_own_tenant" on tenants
  for update
  using (id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

create policy "tenant_isolation_select" on reservations
  for select
  using (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

create policy "tenant_isolation_insert" on reservations
  for insert
  with check (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

create policy "tenant_isolation_update" on reservations
  for update
  using (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

create policy "tenant_isolation_delete" on reservations
  for delete
  using (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

create policy "tenant_isolation_conv_select" on conversations
  for select
  using (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

create policy "tenant_isolation_conv_insert" on conversations
  for insert
  with check (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

create policy "tenant_isolation_conv_update" on conversations
  for update
  using (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

create policy "tenant_isolation_routes_select" on tenant_phone_routes
  for select
  using (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');
