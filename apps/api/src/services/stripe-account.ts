import { type Database, type TenantStripeAccount, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { SecretBox } from "../lib/secret-box.js";

const STRIPE_API = "https://api.stripe.com/v1";

/** Compte Stripe sans la clé — seule forme qui sort par l'API admin. */
export type SafeStripeAccount = Omit<TenantStripeAccount, "secretKeyEnc">;

export interface StripeCharge {
  id: string;
  amountCents: number;
  currency: string;
  description: string | null;
  /** Date de création du paiement chez Stripe. */
  created: Date;
}

/**
 * Comptes Stripe du commerce : connexion par clé secrète restreinte (lecture
 * seule), chiffrée AES-256-GCM au repos, jamais exposée par l'API. Le curseur
 * est initialisé à la connexion : on n'ingère que les paiements reçus APRÈS.
 *
 * REST brut (pas de SDK Stripe) — même parti pris que les autres providers.
 * v1 : clé restreinte pastée par le patron. La montée en Stripe Connect
 * (OAuth plateforme) viendra quand on aura une app Connect validée.
 */
export class StripeAccountService {
  constructor(
    private readonly db: Database,
    private readonly box: SecretBox,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Relie un compte Stripe : valide la clé (un appel /charges), chiffre et
   * stocke, initialise le curseur à maintenant. Échoue si la clé est refusée.
   */
  async connect(tenantId: string, secretKey: string, now = new Date()): Promise<SafeStripeAccount> {
    const key = secretKey.trim();
    if (!key.startsWith("sk_") && !key.startsWith("rk_")) {
      throw new BadRequestError("Clé Stripe invalide (attendu sk_… ou rk_…)", "stripe_key_invalid");
    }
    // Validation : un GET /charges suffit à vérifier l'authentification.
    const res = await this.stripeGet(key, "/charges?limit=1");
    if (res.status === 401) {
      throw new BadRequestError("Clé Stripe refusée par Stripe (401)", "stripe_key_rejected");
    }
    if (!res.ok) {
      throw new BadRequestError(`Stripe a répondu HTTP ${res.status}`, "stripe_unavailable");
    }

    const [row] = await this.db
      .insert(schema.tenantStripeAccounts)
      .values({
        tenantId,
        secretKeyEnc: this.box.encrypt(key),
        chargeCursor: now,
      })
      .returning();
    if (!row) throw new Error("insert tenant_stripe_accounts failed");
    logger.info({ tenantId }, "Compte Stripe connecté");
    return toSafe(row);
  }

  /** Paiements réussis créés après `since`, du plus ancien au plus récent. */
  async listChargesSince(secretKey: string, since: Date, limit = 100): Promise<StripeCharge[]> {
    const sinceUnix = Math.floor(since.getTime() / 1000);
    const res = await this.stripeGet(secretKey, `/charges?created[gt]=${sinceUnix}&limit=${limit}`);
    if (!res.ok) throw new Error(`charges.list HTTP ${res.status}`);
    const data = (await res.json()) as {
      data?: Array<{
        id: string;
        amount: number;
        currency: string;
        created: number;
        paid?: boolean;
        refunded?: boolean;
        description?: string | null;
      }>;
    };
    return (data.data ?? [])
      .filter((c) => c.paid && !c.refunded)
      .map((c) => ({
        id: c.id,
        amountCents: c.amount,
        currency: c.currency.toUpperCase(),
        description: c.description ?? null,
        created: new Date(c.created * 1000),
      }))
      .sort((a, b) => a.created.getTime() - b.created.getTime());
  }

  async list(tenantId: string): Promise<SafeStripeAccount[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantStripeAccounts)
      .where(eq(schema.tenantStripeAccounts.tenantId, tenantId));
    return rows.map(toSafe);
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: "active" | "paused",
  ): Promise<SafeStripeAccount> {
    const [row] = await this.db
      .update(schema.tenantStripeAccounts)
      .set({ status })
      .where(
        and(
          eq(schema.tenantStripeAccounts.tenantId, tenantId),
          eq(schema.tenantStripeAccounts.id, id),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError("Compte Stripe introuvable");
    return toSafe(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.tenantStripeAccounts)
      .where(
        and(
          eq(schema.tenantStripeAccounts.tenantId, tenantId),
          eq(schema.tenantStripeAccounts.id, id),
        ),
      )
      .returning({ id: schema.tenantStripeAccounts.id });
    if (!row) throw new NotFoundError("Compte Stripe introuvable");
  }

  /** Clé en clair pour la sync — usage interne uniquement. */
  decryptKey(account: TenantStripeAccount): string {
    return this.box.decrypt(account.secretKeyEnc);
  }

  private stripeGet(key: string, path: string): Promise<Response> {
    return this.fetchImpl(`${STRIPE_API}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
  }
}

function toSafe(row: TenantStripeAccount): SafeStripeAccount {
  const { secretKeyEnc: _s, ...rest } = row;
  return rest;
}
