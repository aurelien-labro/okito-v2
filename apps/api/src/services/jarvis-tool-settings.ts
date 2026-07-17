import { type Database, type JarvisPolicy, type JarvisToolSetting, schema } from "@okito/db";
import { and, eq } from "drizzle-orm";
import { BadRequestError } from "../lib/errors.js";

/**
 * Catalogue des boucles autonomes exposées dans la boutique d'automatisations.
 * `defaultPolicy` doit rester aligné avec DEFAULT_POLICIES de JarvisActionService
 * (la policy effective est résolue là-bas ; ici c'est l'affichage).
 */
export interface JarvisToolCatalogEntry {
  type: string;
  label: string;
  description: string;
  defaultPolicy: JarvisPolicy;
}

export const JARVIS_TOOL_CATALOG: JarvisToolCatalogEntry[] = [
  {
    type: "review.reply",
    label: "Réponse aux avis clients",
    description:
      "Un avis interne de 3★ ou moins reçoit une réponse rédigée par Jarvis et envoyée par email, annulable pendant 24 h.",
    defaultPolicy: "auto_cancellable",
  },
  {
    type: "google.review.reply",
    label: "Réponse aux avis Google",
    description:
      "Chaque nouvel avis sur la fiche Google Business reçoit une réponse publique rédigée par Jarvis, annulable pendant 24 h.",
    defaultPolicy: "auto_cancellable",
  },
  {
    type: "invoice.remind",
    label: "Relance des factures échues",
    description:
      "Une facture client passée en retard déclenche un email de relance rédigé par Jarvis, annulable pendant 24 h.",
    defaultPolicy: "auto_cancellable",
  },
  {
    type: "supplier_invoice.pay_reminder",
    label: "Rappel d'échéances fournisseurs",
    description:
      "Une facture fournisseur à payer sous 3 jours déclenche un rappel email au patron (sans LLM).",
    defaultPolicy: "auto_cancellable",
  },
];

const CATALOG_BY_TYPE = new Map(JARVIS_TOOL_CATALOG.map((t) => [t.type, t]));

export interface JarvisToolStatus extends JarvisToolCatalogEntry {
  enabled: boolean;
  policyOverride: JarvisPolicy | null;
}

/**
 * Boutique d'automatisations (marketplace interne v1, vague 4) : le patron
 * active/désactive chaque boucle et peut forcer sa politique. Pas de ligne
 * en base = défaut (actif, policy du code). Un type hors catalogue n'est pas
 * réglable — les tools systèmes restent gouvernés par le code seul.
 */
export class JarvisToolSettingsService {
  constructor(private readonly db: Database) {}

  /** Catalogue fusionné avec les réglages du tenant, pour la page dashboard. */
  async list(tenantId: string): Promise<JarvisToolStatus[]> {
    const rows = await this.db
      .select()
      .from(schema.jarvisToolSettings)
      .where(eq(schema.jarvisToolSettings.tenantId, tenantId));
    const byType = new Map(rows.map((r) => [r.toolType, r]));
    return JARVIS_TOOL_CATALOG.map((entry) => ({
      ...entry,
      enabled: byType.get(entry.type)?.enabled ?? true,
      policyOverride: byType.get(entry.type)?.policyOverride ?? null,
    }));
  }

  async setEnabled(tenantId: string, type: string, enabled: boolean): Promise<JarvisToolSetting> {
    return this.upsert(tenantId, type, { enabled });
  }

  async setPolicyOverride(
    tenantId: string,
    type: string,
    policyOverride: JarvisPolicy | null,
  ): Promise<JarvisToolSetting> {
    return this.upsert(tenantId, type, { policyOverride });
  }

  /** Un type hors catalogue est toujours actif (gouverné par le code seul). */
  async isEnabled(tenantId: string, type: string): Promise<boolean> {
    if (!CATALOG_BY_TYPE.has(type)) return true;
    const row = await this.get(tenantId, type);
    return row?.enabled ?? true;
  }

  /** Policy forcée par le patron, ou null (= défaut du code). */
  async policyOverride(tenantId: string, type: string): Promise<JarvisPolicy | null> {
    const row = await this.get(tenantId, type);
    return row?.policyOverride ?? null;
  }

  private async get(tenantId: string, type: string): Promise<JarvisToolSetting | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.jarvisToolSettings)
      .where(
        and(
          eq(schema.jarvisToolSettings.tenantId, tenantId),
          eq(schema.jarvisToolSettings.toolType, type),
        ),
      )
      .limit(1);
    return row;
  }

  private async upsert(
    tenantId: string,
    type: string,
    patch: { enabled?: boolean; policyOverride?: JarvisPolicy | null },
  ): Promise<JarvisToolSetting> {
    if (!CATALOG_BY_TYPE.has(type)) {
      throw new BadRequestError(`Tool inconnu : ${type}`, "unknown_tool");
    }
    const [row] = await this.db
      .insert(schema.jarvisToolSettings)
      .values({ tenantId, toolType: type, ...patch })
      .onConflictDoUpdate({
        target: [schema.jarvisToolSettings.tenantId, schema.jarvisToolSettings.toolType],
        set: { ...patch, updatedAt: new Date() },
      })
      .returning();
    if (!row) throw new Error("upsert jarvis_tool_settings failed");
    return row;
  }
}
