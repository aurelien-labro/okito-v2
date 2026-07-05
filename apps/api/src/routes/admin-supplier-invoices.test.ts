import { schema } from "@okito/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import { SupplierInvoiceService } from "../services/supplier-invoice.js";
import { adminSupplierInvoicesRoute } from "./admin-supplier-invoices.js";

describe("adminSupplierInvoicesRoute", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let app: ReturnType<typeof adminSupplierInvoicesRoute>;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-supplier-route", name: "Resto" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    app = adminSupplierInvoicesRoute(new SupplierInvoiceService(ctx.db));
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function createOne(body?: Record<string, unknown>) {
    const res = await app.request(`/${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierName: "Metro",
        invoiceNumber: "F-42",
        amountCents: 45000,
        category: "matières premières",
        dueDate: "2026-08-01T00:00:00Z",
        ...body,
      }),
    });
    return res;
  }

  it("POST crée une facture fournisseur", async () => {
    const res = await createOne();
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { status: string; supplierName: string } };
    expect(body.data).toMatchObject({ status: "received", supplierName: "Metro" });
  });

  it("POST 400 sur montant manquant", async () => {
    const res = await app.request(`/${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierName: "Metro" }),
    });
    expect(res.status).toBe(400);
  });

  it("GET liste et filtre par statut", async () => {
    await createOne();
    await createOne({ invoiceNumber: "F-43" });

    const all = await app.request(`/${tenantId}`);
    expect(all.status).toBe(200);
    expect(((await all.json()) as { data: unknown[] }).data).toHaveLength(2);

    const paid = await app.request(`/${tenantId}?status=paid`);
    expect(((await paid.json()) as { data: unknown[] }).data).toHaveLength(0);
  });

  it("approve puis paid via les endpoints", async () => {
    const created = (await (await createOne()).json()) as { data: { id: string } };
    const id = created.data.id;

    const approved = await app.request(`/${tenantId}/${id}/approve`, { method: "POST" });
    expect(approved.status).toBe(200);
    expect(((await approved.json()) as { data: { status: string } }).data.status).toBe("approved");

    const paid = await app.request(`/${tenantId}/${id}/paid`, { method: "POST" });
    expect(((await paid.json()) as { data: { status: string } }).data.status).toBe("paid");
  });

  it("dispute et cancel via les endpoints", async () => {
    const a = (await (await createOne()).json()) as { data: { id: string } };
    const b = (await (await createOne({ invoiceNumber: "F-99" })).json()) as {
      data: { id: string };
    };

    const disputed = await app.request(`/${tenantId}/${a.data.id}/dispute`, { method: "POST" });
    expect(((await disputed.json()) as { data: { status: string } }).data.status).toBe("disputed");

    const cancelled = await app.request(`/${tenantId}/${b.data.id}/cancel`, { method: "POST" });
    expect(((await cancelled.json()) as { data: { status: string } }).data.status).toBe(
      "cancelled",
    );
  });

  it("extract : 400 extraction_unavailable si LLM absent", async () => {
    const res = await app.request(`/${tenantId}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: "application/pdf", dataBase64: "JVBERi0=" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("extraction_unavailable");
  });

  it("POST accepte source=upload avec le brut extrait", async () => {
    const res = await createOne({
      source: "upload",
      extracted: { confidence: 0.9, supplierName: "Metro" },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { source: string; extracted: unknown } };
    expect(body.data.source).toBe("upload");
    expect(body.data.extracted).toMatchObject({ confidence: 0.9 });
  });
});
