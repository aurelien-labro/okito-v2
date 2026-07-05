import { INVOICE_STATUSES } from "@okito/db";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { InvoiceService } from "../services/invoice.js";

const uuidParam = z.string().uuid();
const statusQuery = z.enum(INVOICE_STATUSES).optional();

const lineSchema = z.object({
  label: z.string().min(1).max(200),
  quantity: z.number().positive().max(100000),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
});

const createSchema = z.object({
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().nullable().optional(),
  lines: z.array(lineSchema).min(1),
  currency: z.string().length(3).optional(),
  vatRateBps: z.number().int().min(0).max(3000).optional(),
  dueInDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** Factures clients d'un tenant (module Admin). */
export function adminInvoicesRoute(service: InvoiceService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/invoices/:tenantId?status=sent
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const status = parseOrThrow(statusQuery, c.req.query("status"), "status");
    return c.json({ data: await service.list(tenantId, status) });
  });

  // POST /v1/admin/invoices/:tenantId
  app.post("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const input = parseOrThrow(createSchema, await readJson(c), "body");
    return c.json({ data: await service.create(tenantId, input) }, 201);
  });

  // POST /v1/admin/invoices/:tenantId/:id/send
  app.post("/:tenantId/:id/send", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    const body = await readJson(c).catch(() => ({}));
    const { dueInDays } = parseOrThrow(
      z.object({ dueInDays: z.number().int().min(1).max(365).optional() }),
      body,
      "body",
    );
    return c.json({ data: await service.send(tenantId, id, dueInDays) });
  });

  // POST /v1/admin/invoices/:tenantId/:id/paid
  app.post("/:tenantId/:id/paid", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    return c.json({ data: await service.markPaid(tenantId, id) });
  });

  // POST /v1/admin/invoices/:tenantId/:id/cancel
  app.post("/:tenantId/:id/cancel", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    return c.json({ data: await service.cancel(tenantId, id) });
  });

  return app;
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestError("JSON invalide", "invalid_json");
  }
}

function parseOrThrow<T>(schemaArg: z.ZodType<T>, value: unknown, label: string): T {
  const result = schemaArg.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.join(".") || label} : ${i.message}`)
    .join("; ");
  throw new BadRequestError(message, "validation_error");
}
