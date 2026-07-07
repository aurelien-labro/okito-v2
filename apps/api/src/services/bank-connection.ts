import { type Database, type TenantBankConnection, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { SecretBox } from "../lib/secret-box.js";

/**
 * Base API de l'agrégateur. Modelé sur Bridge (agrégateur français) ; le
 * contrat exact (endpoints, forme des transactions) sera aligné à
 * l'intégration réelle — seul `mapTransaction` est à ajuster.
 */
const BRIDGE_API = "https://api.bridgeapi.io/v2";

/** Connexion sans le jeton — seule forme qui sort par l'API admin. */
export type SafeBankConnection = Omit<TenantBankConnection, "accessTokenEnc">;

export interface BankTransaction {
  id: string;
  /** Montant signé en centimes : négatif = débit, positif = crédit. */
  amountCents: number;
  currency: string;
  description: string | null;
  /** Date comptable de l'opération. */
  date: Date;
}

/**
 * Connexions bancaires du commerce : accès à un agrégateur (Bridge / Powens)
 * relié par jeton, chiffré AES-256-GCM au repos, jamais exposé par l'API. Le
 * curseur est initialisé à la connexion : on n'ingère que les mouvements
 * postérieurs.
 *
 * REST brut, même parti pris que les autres providers. v1 : jeton d'accès
 * fourni par le patron (ou obtenu via le widget de connexion de l'agrégateur,
 * hors périmètre de cette itération).
 */
export class BankConnectionService {
  constructor(
    private readonly db: Database,
    private readonly box: SecretBox,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly apiBase = BRIDGE_API,
  ) {}

  /**
   * Relie un accès bancaire : valide le jeton (un appel /accounts), chiffre et
   * stocke, initialise le curseur à maintenant. Échoue si le jeton est refusé.
   */
  async connect(
    tenantId: string,
    accessToken: string,
    now = new Date(),
  ): Promise<SafeBankConnection> {
    const token = accessToken.trim();
    if (token.length < 10) {
      throw new BadRequestError("Jeton bancaire invalide", "bank_token_invalid");
    }
    const res = await this.get(token, "/accounts");
    if (res.status === 401) {
      throw new BadRequestError(
        "Jeton bancaire refusé par l'agrégateur (401)",
        "bank_token_rejected",
      );
    }
    if (!res.ok) {
      throw new BadRequestError(`Agrégateur a répondu HTTP ${res.status}`, "bank_unavailable");
    }

    const [row] = await this.db
      .insert(schema.tenantBankConnections)
      .values({
        tenantId,
        accessTokenEnc: this.box.encrypt(token),
        transactionCursor: now,
      })
      .returning();
    if (!row) throw new Error("insert tenant_bank_connections failed");
    logger.info({ tenantId }, "Connexion bancaire reliée");
    return toSafe(row);
  }

  /** Transactions créées après `since`, du plus ancien au plus récent. */
  async listTransactionsSince(
    accessToken: string,
    since: Date,
    limit = 200,
  ): Promise<BankTransaction[]> {
    const sinceIso = since.toISOString().slice(0, 10);
    const res = await this.get(accessToken, `/transactions?since=${sinceIso}&limit=${limit}`);
    if (!res.ok) throw new Error(`transactions.list HTTP ${res.status}`);
    const data = (await res.json()) as {
      resources?: Array<{
        id: number | string;
        amount: number;
        currency_code?: string;
        description?: string | null;
        date: string;
      }>;
    };
    return (data.resources ?? [])
      .map((t) => mapTransaction(t))
      .filter((t): t is BankTransaction => t !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async list(tenantId: string): Promise<SafeBankConnection[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantBankConnections)
      .where(eq(schema.tenantBankConnections.tenantId, tenantId));
    return rows.map(toSafe);
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: "active" | "paused",
  ): Promise<SafeBankConnection> {
    const [row] = await this.db
      .update(schema.tenantBankConnections)
      .set({ status })
      .where(
        and(
          eq(schema.tenantBankConnections.tenantId, tenantId),
          eq(schema.tenantBankConnections.id, id),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError("Connexion bancaire introuvable");
    return toSafe(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(schema.tenantBankConnections)
      .where(
        and(
          eq(schema.tenantBankConnections.tenantId, tenantId),
          eq(schema.tenantBankConnections.id, id),
        ),
      )
      .returning({ id: schema.tenantBankConnections.id });
    if (!row) throw new NotFoundError("Connexion bancaire introuvable");
  }

  /** Jeton en clair pour la sync — usage interne uniquement. */
  decryptToken(connection: TenantBankConnection): string {
    return this.box.decrypt(connection.accessTokenEnc);
  }

  private get(token: string, path: string): Promise<Response> {
    return this.fetchImpl(`${this.apiBase}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

/** Convertit une transaction agrégateur → forme interne (montant en centimes). */
function mapTransaction(raw: {
  id: number | string;
  amount: number;
  currency_code?: string;
  description?: string | null;
  date: string;
}): BankTransaction | null {
  const date = new Date(raw.date);
  if (Number.isNaN(date.getTime())) return null;
  return {
    id: String(raw.id),
    amountCents: Math.round(raw.amount * 100),
    currency: (raw.currency_code ?? "EUR").toUpperCase(),
    description: raw.description ?? null,
    date,
  };
}

function toSafe(row: TenantBankConnection): SafeBankConnection {
  const { accessTokenEnc: _t, ...rest } = row;
  return rest;
}
