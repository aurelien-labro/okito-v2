import { createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";
import { type Database, type TenantConnector, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { isSafePublicUrl } from "../lib/ssrf.js";

/** Préfixe des types d'action Jarvis portés par un connecteur tiers. */
export const EXTERNAL_ACTION_PREFIX = "ext.";

export function externalActionType(connectorId: string): string {
  return `${EXTERNAL_ACTION_PREFIX}${connectorId}`;
}

/**
 * Manifest d'un connecteur tiers. C'est la chaîne JSON EXACTE fournie qui est
 * signée (pas de canonicalisation) : l'éditeur signe les octets qu'il publie.
 */
const manifestSchema = z.object({
  id: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "slug minuscule (a-z, 0-9, tirets)"),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  version: z.string().min(1).max(32),
  publisher: z.string().min(1).max(120),
  /** Endpoint HTTPS appelé à chaque exécution (POST JSON signé HMAC). */
  endpoint: z.string().url(),
});

export type ConnectorManifest = z.infer<typeof manifestSchema>;

/** Connecteur listé côté dashboard — le secret partagé ne sort jamais. */
export interface ConnectorStatus {
  connectorId: string;
  name: string;
  description: string;
  publisher: string;
  version: string;
  endpoint: string;
  enabled: boolean;
  actionType: string;
  installedAt: Date;
}

/**
 * Marketplace de connecteurs tiers signés (vague 5, chantier 4).
 *
 * Registre de confiance : `trustedPublishers` mappe un nom d'éditeur vers sa
 * clé publique Ed25519 (base64 DER SPKI) — chargé depuis
 * MARKETPLACE_TRUSTED_PUBLISHERS. Un manifest n'est installable que si son
 * éditeur est au registre ET que la signature Ed25519 des octets du manifest
 * est valide. Les actions d'un connecteur (`ext.<id>`) tombent sur la policy
 * "approval" par défaut (type inconnu de DEFAULT_POLICIES) : dans le doute,
 * Jarvis demande — le patron peut assouplir via la boutique.
 */
export class ConnectorMarketplaceService {
  constructor(
    private readonly db: Database,
    private readonly trustedPublishers: Record<string, string>,
  ) {}

  /**
   * Vérifie signature + registre puis installe (ou met à jour) le connecteur.
   * Réinstallation du même connecteur : manifest rafraîchi, secret conservé
   * (l'éditeur n'a pas à re-provisionner le secret à chaque montée de version).
   */
  async install(
    tenantId: string,
    manifestJson: string,
    signatureB64: string,
  ): Promise<ConnectorStatus> {
    const manifest = this.verify(manifestJson, signatureB64);
    if (!manifest.endpoint.startsWith("https://") || !isSafePublicUrl(manifest.endpoint)) {
      throw new BadRequestError(
        "Endpoint du connecteur invalide : HTTPS public obligatoire",
        "invalid_endpoint",
      );
    }
    const [row] = await this.db
      .insert(schema.tenantConnectors)
      .values({
        tenantId,
        connectorId: manifest.id,
        name: manifest.name,
        publisher: manifest.publisher,
        version: manifest.version,
        endpoint: manifest.endpoint,
        manifest: manifest as unknown as Record<string, unknown>,
        sharedSecret: randomBytes(32).toString("hex"),
      })
      .onConflictDoUpdate({
        target: [schema.tenantConnectors.tenantId, schema.tenantConnectors.connectorId],
        set: {
          name: manifest.name,
          publisher: manifest.publisher,
          version: manifest.version,
          endpoint: manifest.endpoint,
          manifest: manifest as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error("upsert tenant_connectors failed");
    return toStatus(row);
  }

  /**
   * Valide le manifest et sa signature Ed25519. L'ordre compte : registre
   * d'abord (un éditeur inconnu n'a pas droit à un oracle de signature).
   */
  verify(manifestJson: string, signatureB64: string): ConnectorManifest {
    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestJson);
    } catch {
      throw new BadRequestError("Manifest : JSON invalide", "invalid_manifest");
    }
    const result = manifestSchema.safeParse(parsed);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".")} : ${i.message}`)
        .join("; ");
      throw new BadRequestError(`Manifest invalide — ${message}`, "invalid_manifest");
    }
    const manifest = result.data;

    const publicKeyB64 = this.trustedPublishers[manifest.publisher];
    if (!publicKeyB64) {
      throw new BadRequestError(`Éditeur non reconnu : ${manifest.publisher}`, "unknown_publisher");
    }
    let ok = false;
    try {
      const key = createPublicKey({
        key: Buffer.from(publicKeyB64, "base64"),
        format: "der",
        type: "spki",
      });
      ok = verifySignature(
        null,
        Buffer.from(manifestJson, "utf8"),
        key,
        Buffer.from(signatureB64, "base64"),
      );
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new BadRequestError("Signature du manifest invalide", "invalid_signature");
    }
    return manifest;
  }

  async list(tenantId: string): Promise<ConnectorStatus[]> {
    const rows = await this.db
      .select()
      .from(schema.tenantConnectors)
      .where(eq(schema.tenantConnectors.tenantId, tenantId))
      .orderBy(schema.tenantConnectors.createdAt);
    return rows.map(toStatus);
  }

  /** Connecteur installé (avec secret) — pour l'exécution, jamais exposé en API. */
  async get(tenantId: string, connectorId: string): Promise<TenantConnector | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.tenantConnectors)
      .where(
        and(
          eq(schema.tenantConnectors.tenantId, tenantId),
          eq(schema.tenantConnectors.connectorId, connectorId),
        ),
      )
      .limit(1);
    return row;
  }

  async setEnabled(
    tenantId: string,
    connectorId: string,
    enabled: boolean,
  ): Promise<ConnectorStatus> {
    const [row] = await this.db
      .update(schema.tenantConnectors)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(schema.tenantConnectors.tenantId, tenantId),
          eq(schema.tenantConnectors.connectorId, connectorId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError("Connecteur introuvable");
    return toStatus(row);
  }

  async uninstall(tenantId: string, connectorId: string): Promise<void> {
    const deleted = await this.db
      .delete(schema.tenantConnectors)
      .where(
        and(
          eq(schema.tenantConnectors.tenantId, tenantId),
          eq(schema.tenantConnectors.connectorId, connectorId),
        ),
      )
      .returning({ id: schema.tenantConnectors.id });
    if (deleted.length === 0) throw new NotFoundError("Connecteur introuvable");
  }
}

function toStatus(row: TenantConnector): ConnectorStatus {
  const description = typeof row.manifest.description === "string" ? row.manifest.description : "";
  return {
    connectorId: row.connectorId,
    name: row.name,
    description,
    publisher: row.publisher,
    version: row.version,
    endpoint: row.endpoint,
    enabled: row.enabled,
    actionType: externalActionType(row.connectorId),
    installedAt: row.createdAt,
  };
}

/** Parse MARKETPLACE_TRUSTED_PUBLISHERS (JSON {"éditeur": "clé base64 SPKI"}). */
export function parseTrustedPublishers(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return z.record(z.string(), z.string().min(1)).parse(parsed);
  } catch {
    throw new Error(
      'MARKETPLACE_TRUSTED_PUBLISHERS invalide : JSON {"éditeur": "clé publique base64 SPKI"} attendu',
    );
  }
}
