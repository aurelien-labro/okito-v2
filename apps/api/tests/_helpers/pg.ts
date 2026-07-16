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
      parent_tenant_id uuid references tenants(id) on delete set null,
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

    create table waitlist_entries (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      customer_name text not null,
      customer_phone text not null,
      customer_email text,
      couverts integer not null,
      date_souhaitee date not null,
      heure_souhaitee time not null,
      flex_minutes integer not null default 30,
      status text not null default 'waiting',
      notified_at timestamptz,
      converted_at timestamptz,
      expired_at timestamptz,
      notes text,
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

    create table events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      type text not null,
      source text not null default 'api',
      payload jsonb not null default '{}',
      created_at timestamptz not null default now()
    );

    create table jarvis_actions (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      type text not null,
      summary text not null,
      policy text not null,
      status text not null,
      payload jsonb not null default '{}',
      result jsonb,
      cancellable_until timestamptz,
      created_at timestamptz not null default now(),
      executed_at timestamptz,
      cancelled_at timestamptz
    );

    create table tenant_mailboxes (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      provider text not null default 'gmail',
      email_address text not null,
      access_token text,
      refresh_token text,
      access_token_expires_at timestamptz,
      config jsonb not null default '{}',
      history_id text,
      last_sync_at timestamptz,
      last_error text,
      status text not null default 'active',
      created_at timestamptz not null default now()
    );

    create table invoices (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      number text not null,
      status text not null default 'draft',
      customer_name text not null,
      customer_email text,
      lines jsonb not null default '[]',
      amount_cents integer not null default 0,
      currency text not null default 'EUR',
      vat_rate_bps integer not null default 2000,
      issued_at timestamptz,
      due_date timestamptz,
      paid_at timestamptz,
      reminders_sent integer not null default 0,
      last_reminder_at timestamptz,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, number)
    );

    create table supplier_invoices (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      supplier_name text not null,
      invoice_number text,
      status text not null default 'received',
      amount_cents integer not null,
      currency text not null default 'EUR',
      vat_rate_bps integer not null default 2000,
      category text,
      invoice_date timestamptz,
      due_date timestamptz,
      paid_at timestamptz,
      source text not null default 'manual',
      extracted jsonb,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create unique index supplier_invoices_tenant_supplier_number_uniq
      on supplier_invoices (tenant_id, supplier_name, invoice_number)
      where invoice_number is not null;

    create table tenant_google_business (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      account_name text not null,
      location_name text not null,
      location_title text not null,
      access_token text not null,
      refresh_token text not null,
      access_token_expires_at timestamptz not null,
      review_cursor timestamptz,
      last_sync_at timestamptz,
      last_error text,
      status text not null default 'active',
      created_at timestamptz not null default now()
    );
    create unique index tenant_google_business_location_uniq
      on tenant_google_business (tenant_id, location_name);

    create table tenant_calendars (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      calendar_id text not null,
      calendar_summary text not null,
      access_token text not null,
      refresh_token text not null,
      access_token_expires_at timestamptz not null,
      events_cursor timestamptz,
      last_sync_at timestamptz,
      last_error text,
      status text not null default 'active',
      created_at timestamptz not null default now()
    );
    create unique index tenant_calendars_calendar_uniq
      on tenant_calendars (tenant_id, calendar_id);

    create table tenant_bank_connections (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      provider text not null default 'bridge',
      account_label text not null default 'Banque',
      access_token_enc text not null,
      transaction_cursor timestamptz,
      last_sync_at timestamptz,
      last_error text,
      status text not null default 'active',
      created_at timestamptz not null default now()
    );

    create table tenant_shopify_connections (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      shop_domain text not null,
      shop_label text not null default 'Boutique Shopify',
      access_token_enc text not null,
      order_cursor timestamptz,
      last_sync_at timestamptz,
      last_error text,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      unique (tenant_id, shop_domain)
    );

    create table tenant_woocommerce_connections (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      store_url text not null,
      store_label text not null default 'Boutique WooCommerce',
      credentials_enc text not null,
      order_cursor timestamptz,
      last_sync_at timestamptz,
      last_error text,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      unique (tenant_id, store_url)
    );

    create table tenant_google_ads_connections (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      account_label text not null default 'Google Ads',
      access_token text not null,
      refresh_token text not null,
      access_token_expires_at timestamptz not null,
      last_sync_at timestamptz,
      last_error text,
      status text not null default 'active',
      created_at timestamptz not null default now()
    );

    create table tenant_meta_connections (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      external_account_id text not null,
      account_label text not null default 'Meta Ads',
      access_token text not null,
      access_token_expires_at timestamptz not null,
      last_sync_at timestamptz,
      last_error text,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      unique (tenant_id, external_account_id)
    );

    create table campaigns (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      channel text not null,
      segment text not null,
      subject text,
      body text not null,
      status text not null default 'draft',
      recipient_count integer not null default 0,
      sent_count integer not null default 0,
      failed_count integer not null default 0,
      sent_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table tenant_sites (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      slug text not null,
      theme text not null default 'okito',
      blocks jsonb not null default '{}',
      seo jsonb not null default '{}',
      status text not null default 'draft',
      published_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id),
      unique (slug)
    );

    create table tenant_stripe_accounts (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      account_label text not null default 'Stripe',
      secret_key_enc text not null,
      charge_cursor timestamptz,
      last_sync_at timestamptz,
      last_error text,
      status text not null default 'active',
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
