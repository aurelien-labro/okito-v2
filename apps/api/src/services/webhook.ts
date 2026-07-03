import { randomBytes } from "node:crypto";
import { type Database, type TenantWebhook, type WebhookEvent, schema } from "@okito/db";
import { and, asc, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { isSafePublicUrl } from "../lib/ssrf.js";

export interface CreateWebhookInput {
  tenantId: string;
  url: string;
  events?: WebhookEvent[];
}

/** CRUD des webhooks sortants d'un tenant. Le secret est généré côté serveur. */
export class WebhookService {
  constructor(private readonly db: Database) {}

  async listByTenant(tenantId: string): Promise<TenantWebhook[]> {
    return this.db
      .select()
      .from(schema.tenantWebhooks)
      .where(eq(schema.tenantWebhooks.tenantId, tenantId))
      .orderBy(asc(schema.tenantWebhooks.createdAt));
  }

  async create(input: CreateWebhookInput): Promise<TenantWebhook> {
    if (!isSafePublicUrl(input.url)) {
      throw new BadRequestError(
        "L'URL doit être publique en http(s) (pas d'adresse interne).",
        "unsafe_url",
      );
    }
    const [row] = await this.db
      .insert(schema.tenantWebhooks)
      .values({
        tenantId: input.tenantId,
        url: input.url,
        secret: `whsec_${randomBytes(24).toString("hex")}`,
        events: input.events ?? [],
      })
      .returning();
    if (!row) throw new Error("tenant_webhooks insert returned no row");
    return row;
  }

  async setActive(id: string, active: boolean): Promise<TenantWebhook> {
    const [row] = await this.db
      .update(schema.tenantWebhooks)
      .set({ active })
      .where(eq(schema.tenantWebhooks.id, id))
      .returning();
    if (!row) throw new NotFoundError("Webhook introuvable");
    return row;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(schema.tenantWebhooks).where(eq(schema.tenantWebhooks.id, id));
  }

  async removeForTenant(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(schema.tenantWebhooks)
      .where(and(eq(schema.tenantWebhooks.id, id), eq(schema.tenantWebhooks.tenantId, tenantId)));
  }
}
