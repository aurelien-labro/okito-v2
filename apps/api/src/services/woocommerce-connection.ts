import { type Database, type TenantWoocommerceConnection, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { SecretBox } from "../lib/secret-box.js";

/** Connexion sans les clés — seule forme qui sort par l'API admin. */
export type SafeWoocommerceConnection = Omit<TenantWoocommerceConnection, "credentialsEnc">;

export interface WoocommerceCredentials {
  consumerKey: string;
  consumerSecret: string;
}

export interface WoocommerceOrder {
  id: string;
  /** Numéro lisible de la commande. */
  number: string;
  /** Total TTC en centimes. */
  totalCents: number;
  /** Taxes totales en centimes. */
  taxCents: number;
  currency: string;
  status: string | null;
  /** Date de création UTC. */
  createdAt: Date;
}

/**
 * Boutiques WooCommerce du commerce : reliées par clés REST API (consumer
 * key + secret), chiffrées ensemble AES-256-GCM au repos, jamais exposées par
 * l'API. Le curseur est initialisé à la connexion : on n'ingère que les
 * commandes postérieures.
 *
 * REST brut (Basic Auth sur HTTPS, méthode officielle WooCommerce), même
 * parti pris que Shopify (0031).
 */
export class WoocommerceConnectionService {
  constructor(
    private readonly db: Database,
    private readonly box: SecretBox,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Relie une boutique : valide URL + clés (un appel /orders?per_page=1),
   * chiffre et stocke, initialise le curseur à maintenant.
   */
  async connect(
    tenantId: string,
    storeUrl: string,
    consumerKey: string,
    consumerSecret: string,
    now = new Date(),
  ): Promise<SafeWoocommerceConnection> {
    const url = normalizeStoreUrl(storeUrl);
    const creds: WoocommerceCredentials = {
      consumerKey: consumerKey.trim(),
      consumerSecret: consumerSecret.trim(),
    };
    if (creds.consumerKey.length < 10 || creds.consumerSecret.length < 10) {
      throw new BadRequestError("Clés WooCommerce invalides", "woocommerce_keys_invalid");
    }

    const res = await this.get(url, creds, "/orders?per_page=1");
    if (res.status === 401 || res.status === 403) {
      throw new BadRequestError(
        `Clés refusées par WooCommerce (${res.status})`,
        "woocommerce_keys_rejected",
      );
    }
    if (!res.ok) {
      throw new BadRequestError(
        `WooCommerce a répondu HTTP ${res.status}`,
        "woocommerce_unavailable",
      );
    }

    const [row] = await this.db
      .insert(schema.tenantWoocommerceConnections)
      .values({
        tenantId,
        storeUrl: url,
        storeLabel: new URL(url).hostname,
        credentialsEnc: this.box.encrypt(JSON.stringify(creds)),
        orderCursor: now,
      })
      .returning();
    if (!row) throw new Error("insert tenant_woocommerce_connections failed");
    logger.info({ tenantId, storeUrl: url }, "Boutique WooCommerce reliée");
    return toSafe(row);
  }

  /** Commandes créées après `since`, de la plus ancienne à la plus récente. */
  async listOrdersSince(
    storeUrl: string,
    creds: WoocommerceCredentials,
    since: Date,
    limit = 100,
  ): Promise<WoocommerceOrder[]> {
    const params = `after=${encodeURIComponent(since.toISOString())}&per_page=${Math.min(limit, 100)}&orderby=date&order=asc`;
    const res = await this.get(storeUrl, creds, `/orders?${params}`);
    if (!res.ok) throw new Error(`orders.list HTTP ${res.status}`);
    const data = (await res.json()) as Array<{
      id: number | string;
      number?: string;
      total?: string;
      total_tax?: string;
      currency?: string;
      status?: string | null;
      date_created_gmt?: string;
    }>;
    return (Array.isArray(data) ? data : [])
      .map((o) => mapOrder(o))
      .filter((o): o is WoocommerceOrder => o !== null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async list(tenantId: string): Promise<SafeWoocommerceConnection[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantWoocommerceConnections)
      .where(eq(schema.tenantWoocommerceConnections.tenantId, tenantId));
    return rows.map(toSafe);
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: "active" | "paused",
  ): Promise<SafeWoocommerceConnection> {
    const [row] = await this.db
      .update(schema.tenantWoocommerceConnections)
      .set({ status })
      .where(
        and(
          eq(schema.tenantWoocommerceConnections.tenantId, tenantId),
          eq(schema.tenantWoocommerceConnections.id, id),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError("Boutique WooCommerce introuvable");
    return toSafe(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.tenantWoocommerceConnections)
      .where(
        and(
          eq(schema.tenantWoocommerceConnections.tenantId, tenantId),
          eq(schema.tenantWoocommerceConnections.id, id),
        ),
      )
      .returning({ id: schema.tenantWoocommerceConnections.id });
    if (!row) throw new NotFoundError("Boutique WooCommerce introuvable");
  }

  /** Clés en clair pour la sync — usage interne uniquement. */
  decryptCredentials(connection: TenantWoocommerceConnection): WoocommerceCredentials {
    return JSON.parse(this.box.decrypt(connection.credentialsEnc)) as WoocommerceCredentials;
  }

  private get(storeUrl: string, creds: WoocommerceCredentials, path: string): Promise<Response> {
    const auth = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64");
    return this.fetchImpl(`${storeUrl}/wp-json/wc/v3${path}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
  }
}

/**
 * Normalise l'URL de la boutique : exige HTTPS (les clés passent en Basic
 * Auth), retire le slash final et tout chemin.
 */
export function normalizeStoreUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new BadRequestError(
      "URL de boutique attendue au format https://boutique.fr",
      "woocommerce_url_invalid",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new BadRequestError(
      "La boutique doit être en HTTPS (les clés transitent en Basic Auth)",
      "woocommerce_url_not_https",
    );
  }
  return `${parsed.protocol}//${parsed.host}`;
}

/** Convertit une commande WooCommerce → forme interne (montants en centimes). */
function mapOrder(raw: {
  id: number | string;
  number?: string;
  total?: string;
  total_tax?: string;
  currency?: string;
  status?: string | null;
  date_created_gmt?: string;
}): WoocommerceOrder | null {
  // date_created_gmt arrive sans suffixe de fuseau : forcer UTC.
  const createdAt = raw.date_created_gmt
    ? new Date(`${raw.date_created_gmt}Z`)
    : new Date(Number.NaN);
  if (Number.isNaN(createdAt.getTime())) return null;
  return {
    id: String(raw.id),
    number: raw.number ?? String(raw.id),
    totalCents: toCents(raw.total),
    taxCents: toCents(raw.total_tax),
    currency: (raw.currency ?? "EUR").toUpperCase(),
    status: raw.status ?? null,
    createdAt,
  };
}

function toCents(price: string | undefined): number {
  const parsed = Number.parseFloat(price ?? "0");
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

function toSafe(row: TenantWoocommerceConnection): SafeWoocommerceConnection {
  const { credentialsEnc: _c, ...rest } = row;
  return rest;
}
