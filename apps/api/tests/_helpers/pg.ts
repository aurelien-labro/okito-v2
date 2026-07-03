import { PGlite } from "@electric-sql/pglite";
import { type Database, schema } from "@okito/db";
import { drizzle } from "drizzle-orm/pglite";

/**
 * Spin up un Postgres in-memory (via @electric-sql/pglite — Postgres compilé en
 * WASM) avec le schema OKITO appliqué. Pas de Docker requis, pas de réseau,
 * isolation totale entre les tests.
 *
 * Limitations vs Supabase :
 * - Pas de superuser (RLS s'applique vraiment si activée)
 * - Pas d'extensions complexes (pgcrypto, uuid-ossp absents — on utilise les
 *   defaults gen_random_uuid() qui existent depuis PG 13)
 * - Pas de auth.jwt() de Supabase (donc on ne teste pas les policies RLS ici)
 *
 * Pour des vrais tests RLS, lancer un container Postgres séparé (mais
 * nécessite Docker — pas dispo sur la station de dev d'Aurélien).
 */
export async function createTestDb(): Promise<{
  db: Database;
  cleanup: () => Promise<void>;
}> {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema }) as unknown as Database;

  await applySchema(pglite);

  return {
    db,
    cleanup: async () => {
      await pglite.close();
    },
  };
}

/**
 * Applique le schema minimal nécessaire pour les tests d'isolation.
 * On ne charge pas les migrations 0001-0005 telles quelles (uuid-ossp absent
 * en pglite) ; on recrée les tables avec les contraintes équivalentes.
 */
async function applySchema(pglite: PGlite): Promise<void> {
  await pglite.exec(`
    create table tenants (
      id uuid primary key default gen_random_uuid(),
      slug text not null unique,
      name text not null,
      contact_email text,
      contact_phone text,
      timezone text not null default 'Europe/Paris',
      industry text not null default 'restaurant',
      features jsonb not null default '{}',
      branding jsonb not null default '{}',
      notification_preferences jsonb not null default '{}',
      services jsonb not null default '[]',
      deposit_amount_cents integer not null default 0,
      deposit_required_above_party integer not null default 0,
      deposit_currency text not null default 'EUR',
      capacity_max integer not null default 50,
      service_lunch_start time not null default '12:00',
      service_lunch_end time not null default '14:30',
      service_dinner_start time not null default '19:00',
      service_dinner_end time not null default '22:00',
      reminders_enabled boolean not null default true,
      reminder_hour time not null default '09:00',
      status text not null default 'active',
      stripe_customer_id text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table reservations (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      customer_name text not null,
      customer_phone text not null,
      customer_email text,
      couverts integer not null,
      date_reservation date not null,
      heure time not null,
      status text not null default 'confirmed',
      source text not null default 'unknown',
      notes text,
      deposit_status text,
      deposit_amount_cents integer,
      deposit_payment_intent_id text,
      table_id uuid,
      service_id uuid,
      duration_minutes integer,
      assigned_member_id uuid,
      access_token_hash text unique,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      cancelled_at timestamptz
    );

    create table tenant_tables (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      label text not null,
      capacity integer not null,
      active boolean not null default true,
      created_at timestamptz not null default now()
    );

    create table tenant_members (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      user_id text,
      invited_email text,
      role text not null,
      invited_at timestamptz,
      accepted_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table tenant_schedule_rules (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      kind text not null,
      payload jsonb not null default '{}',
      active boolean not null default true,
      created_at timestamptz not null default now()
    );

    create table reservation_reviews (
      id uuid primary key default gen_random_uuid(),
      reservation_id uuid not null references reservations(id) on delete cascade,
      tenant_id uuid not null references tenants(id) on delete cascade,
      rating integer not null,
      comment text,
      submitted_at timestamptz not null default now(),
      unique (reservation_id)
    );

    create table tenant_webhooks (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      url text not null,
      secret text not null,
      events text[] not null default '{}',
      active boolean not null default true,
      created_at timestamptz not null default now()
    );

    create table tenant_service_catalog (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      description text,
      duration_minutes integer not null default 60,
      price_cents integer,
      currency text not null default 'EUR',
      active boolean not null default true,
      display_order integer not null default 0,
      custom_fields jsonb not null default '{}',
      created_at timestamptz not null default now(),
      unique (tenant_id, name)
    );

    create unique index uniq_active_reservation on reservations
      (tenant_id, customer_phone, date_reservation, heure);

    create table conversations (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      channel text not null,
      session_key text not null,
      status text not null default 'in_progress',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table tenant_phone_routes (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      provider text not null,
      phone_number text not null unique,
      created_at timestamptz not null default now()
    );

    create table audit_log (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid references tenants(id) on delete set null,
      actor_user_id text,
      actor_label text,
      action text not null,
      entity_type text not null,
      entity_id text,
      before jsonb,
      after jsonb,
      ip text,
      user_agent text,
      created_at timestamptz not null default now()
    );
  `);
}
