import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { CustomerTimelineService } from "../services/customer-timeline.js";

const uuidParam = z.string().uuid();

/** Fiche client 360° : profil + timeline reconstruite. */
export function adminCustomerTimelineRoute(service: CustomerTimelineService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/customer-360/:tenantId/:phone
  app.get("/:tenantId/:phone", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const phone = decodeURIComponent(c.req.param("phone"));
    if (!phone.trim()) throw new BadRequestError("Téléphone requis", "missing_phone");
    const profile = await service.getByPhone(tenantId, phone);
    if (!profile) throw new NotFoundError("Aucun client trouvé pour ce numéro");
    return c.json({ data: profile });
  });

  return app;
}

function parseOrThrow<T>(schemaArg: z.ZodType<T>, value: unknown, label: string): T {
  const result = schemaArg.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.join(".") || label} : ${i.message}`)
    .join("; ");
  throw new BadRequestError(message, "validation_error");
}
