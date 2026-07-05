import { SUPPLIER_INVOICE_STATUSES } from "@okito/db";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import {
  EXTRACTION_MAX_BYTES,
  EXTRACTION_MIME_TYPES,
  type SupplierInvoiceExtractionService,
} from "../services/supplier-invoice-extraction.js";
import type { SupplierInvoiceService } from "../services/supplier-invoice.js";

const uuidParam = z.string().uuid();
const statusQuery = z.enum(SUPPLIER_INVOICE_STATUSES).optional();

const createSchema = z.object({
  supplierName: z.string().min(1).max(200),
  invoiceNumber: z.string().min(1).max(100).nullable().optional(),
  amountCents: z.number().int().positive().max(100_000_000),
  currency: z.string().length(3).optional(),
  vatRateBps: z.number().int().min(0).max(3000).optional(),
  category: z.string().min(1).max(100).nullable().optional(),
  invoiceDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  source: z.enum(["manual", "upload", "email"]).optional(),
  extracted: z.record(z.unknown()).nullable().optional(),
});

const extractSchema = z.object({
  mimeType: z.enum(EXTRACTION_MIME_TYPES),
  /** Fichier en base64, sans préfixe data:. */
  dataBase64: z.string().min(1),
});

/** Factures fournisseurs d'un tenant (module Admin, volet achats). */
export function adminSupplierInvoicesRoute(
  service: SupplierInvoiceService,
  extraction?: SupplierInvoiceExtractionService,
) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/supplier-invoices/:tenantId?status=received
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const status = parseOrThrow(statusQuery, c.req.query("status"), "status");
    return c.json({ data: await service.list(tenantId, status) });
  });

  // POST /v1/admin/supplier-invoices/:tenantId
  app.post("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const input = parseOrThrow(createSchema, await readJson(c), "body");
    return c.json({ data: await service.create(tenantId, input) }, 201);
  });

  // POST /v1/admin/supplier-invoices/:tenantId/extract — upload → proposition
  // extraite par le LLM. Ne crée rien : le patron valide puis POST /:tenantId
  // avec source="upload" et le brut dans extracted.
  app.post("/:tenantId/extract", async (c) => {
    if (!extraction) {
      throw new BadRequestError("Extraction non configurée (LLM absent)", "extraction_unavailable");
    }
    parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const { mimeType, dataBase64 } = parseOrThrow(extractSchema, await readJson(c), "body");
    // Borne AVANT tout décodage — 4/3 = overhead base64.
    if (dataBase64.length > (EXTRACTION_MAX_BYTES * 4) / 3) {
      throw new BadRequestError("Fichier trop lourd (6 Mo max)", "file_too_large");
    }
    return c.json({ data: await extraction.extract({ mimeType, dataBase64 }) });
  });

  // POST /v1/admin/supplier-invoices/:tenantId/:id/approve
  app.post("/:tenantId/:id/approve", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    return c.json({ data: await service.approve(tenantId, id) });
  });

  // POST /v1/admin/supplier-invoices/:tenantId/:id/paid
  app.post("/:tenantId/:id/paid", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    return c.json({ data: await service.markPaid(tenantId, id) });
  });

  // POST /v1/admin/supplier-invoices/:tenantId/:id/dispute
  app.post("/:tenantId/:id/dispute", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const id = parseOrThrow(uuidParam, c.req.param("id"), "id");
    return c.json({ data: await service.dispute(tenantId, id) });
  });

  // POST /v1/admin/supplier-invoices/:tenantId/:id/cancel
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
