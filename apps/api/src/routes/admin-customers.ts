import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { AuditLogService } from "../services/audit-log.js";
import type { CustomerPrivacyService } from "../services/customer-privacy.js";

const uuidParam = z.string().uuid();
const phoneSchema = z.string().min(6).max(30);

export function adminCustomersRoute(service: CustomerPrivacyService, audit?: AuditLogService) {
  const app = new Hono<AppEnv>();

  // DELETE /v1/admin/customers/:phone?tenantId=... — droit à l'oubli RGPD
  app.delete("/:phone", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.query("tenantId"), "tenantId");
    const phone = parseOrThrow(phoneSchema, decodeURIComponent(c.req.param("phone")), "phone");
    const result = await service.forget(tenantId, phone);
    if (audit) {
      // On ne persiste pas le téléphone en clair (ce serait contredire l'effacement) :
      // seul un masque non-réversible sert de trace d'audit.
      await audit
        .log({
          action: "customer.forget_rgpd",
          entityType: "customer",
          entityId: maskPhone(phone),
          tenantId,
          actorUserId: c.get("userId") ?? null,
          after: result,
        })
        .catch(() => {});
    }
    return c.json({ data: result });
  });

  return app;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : "••••";
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new BadRequestError(`${label} invalide`, "validation_error");
}
