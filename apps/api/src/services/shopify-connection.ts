import { type Database, type TenantShopifyConnection, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { SecretBox } from "../lib/secret-box.js";

/** Version de l'Admin API Shopify utilisée par toutes les requêtes REST. */
const SHOPIFY_API_VERSION = "2024-10";

/** Connexion sans le jeton — seule forme qui sort par l'API admin. */
export type SafeShopifyConnection = Omit<TenantShopifyConnection, "accessTokenEnc">;

export interface ShopifyOrder {
  id: string;
  /** Numéro lisible de la commande ("#1001"). */
  name: string;
  /** Total TTC en centimes. */
  totalCents: number;
  /** Taxes totales en centimes. */
  taxCents: number;
  currency: string;
  financialStatus: string | null;
  createdAt: Date;
}

/**
 * Boutiques Shopify du commerce : reliées par jeton Admin API (custom app),
 * chiffré AES-256-GCM au repos, jamais exposé par l'API. Le curseur est
 * initialisé à la connexion : on n'ingère que les commandes postérieures.
 *
 * REST brut, même parti pris que les autres providers (banque, Stripe).
 */
export class ShopifyConnectionService {
  constructor(
    private readonly db: Database,
    private readonly box: SecretBox,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Relie une boutique : valide le couple domaine + jeton (un appel
   * /shop.json), chiffre et stocke, initialise le curseur à maintenant.
   */
  async connect(
    tenantId: string,
    shopDomain: string,
    accessToken: string,
    now = new Date(),
  ): Promise<SafeShopifyConnection> {
    const domain = normalizeShopDomain(shopDomain);
    const token = accessToken.trim();
    if (token.length < 10) {
      throw new BadRequestError("Jeton Shopify invalide", "shopify_token_invalid");
    }

    const res = await this.get(domain, token, "/shop.json");
    if (res.status === 401 || res.status === 403) {
      throw new BadRequestError(
        `Jeton refusé par Shopify (${res.status})`,
        "shopify_token_rejected",
      );
    }
    if (!res.ok) {
      throw new BadRequestError(`Shopify a répondu HTTP ${res.status}`, "shopify_unavailable");
    }
    const shop = (await res.json()) as { shop?: { name?: string } };

    const [row] = await this.db
      .insert(schema.tenantShopifyConnections)
      .values({
        tenantId,
        shopDomain: domain,
        shopLabel: shop.shop?.name || domain,
        accessTokenEnc: this.box.encrypt(token),
        orderCursor: now,
      })
      .returning();
    if (!row) throw new Error("insert tenant_shopify_connections failed");
    logger.info({ tenantId, shopDomain: domain }, "Boutique Shopify reliée");
    return toSafe(row);
  }

  /** Commandes créées après `since`, de la plus ancienne à la plus récente. */
  async listOrdersSince(
    shopDomain: string,
    accessToken: string,
    since: Date,
    limit = 200,
  ): Promise<ShopifyOrder[]> {
    const params = `status=any&created_at_min=${encodeURIComponent(since.toISOString())}&limit=${Math.min(limit, 250)}`;
    const res = await this.get(shopDomain, accessToken, `/orders.json?${params}`);
    if (!res.ok) throw new Error(`orders.list HTTP ${res.status}`);
    const data = (await res.json()) as {
      orders?: Array<{
        id: number | string;
        name?: string;
        total_price?: string;
        total_tax?: string;
        currency?: string;
        financial_status?: string | null;
        created_at: string;
      }>;
    };
    return (data.orders ?? [])
      .map((o) => mapOrder(o))
      .filter((o): o is ShopifyOrder => o !== null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async list(tenantId: string): Promise<SafeShopifyConnection[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantShopifyConnections)
      .where(eq(schema.tenantShopifyConnections.tenantId, tenantId));
    return rows.map(toSafe);
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: "active" | "paused",
  ): Promise<SafeShopifyConnection> {
    const [row] = await this.db
      .update(schema.tenantShopifyConnections)
      .set({ status })
      .where(
        and(
          eq(schema.tenantShopifyConnections.tenantId, tenantId),
          eq(schema.tenantShopifyConnections.id, id),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError("Boutique Shopify introuvable");
    return toSafe(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.tenantShopifyConnections)
      .where(
        and(
          eq(schema.tenantShopifyConnections.tenantId, tenantId),
          eq(schema.tenantShopifyConnections.id, id),
        ),
      )
      .returning({ id: schema.tenantShopifyConnections.id });
    if (!row) throw new NotFoundError("Boutique Shopify introuvable");
  }

  /** Jeton en clair pour la sync — usage interne uniquement. */
  decryptToken(connection: TenantShopifyConnection): string {
    return this.box.decrypt(connection.accessTokenEnc);
  }

  private get(shopDomain: string, token: string, path: string): Promise<Response> {
    return this.fetchImpl(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
      headers: { "X-Shopify-Access-Token": token },
    });
  }
}

/**
 * Normalise l'entrée du patron : accepte l'URL complète ou le domaine nu,
 * exige un domaine *.myshopify.com (l'Admin API ne répond que là).
 */
export function normalizeShopDomain(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    throw new BadRequestError(
      "Domaine attendu au format ma-boutique.myshopify.com",
      "shopify_domain_invalid",
    );
  }
  return cleaned;
}

/** Convertit une commande Shopify → forme interne (montants en centimes). */
function mapOrder(raw: {
  id: number | string;
  name?: string;
  total_price?: string;
  total_tax?: string;
  currency?: string;
  financial_status?: string | null;
  created_at: string;
}): ShopifyOrder | null {
  const createdAt = new Date(raw.created_at);
  if (Number.isNaN(createdAt.getTime())) return null;
  return {
    id: String(raw.id),
    name: raw.name ?? String(raw.id),
    totalCents: toCents(raw.total_price),
    taxCents: toCents(raw.total_tax),
    currency: (raw.currency ?? "EUR").toUpperCase(),
    financialStatus: raw.financial_status ?? null,
    createdAt,
  };
}

function toCents(price: string | undefined): number {
  const parsed = Number.parseFloat(price ?? "0");
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

function toSafe(row: TenantShopifyConnection): SafeShopifyConnection {
  const { accessTokenEnc: _t, ...rest } = row;
  return rest;
}
