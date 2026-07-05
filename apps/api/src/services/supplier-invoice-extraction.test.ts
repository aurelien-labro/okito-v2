import type { LLMClient, LLMResponse } from "@okito/shared/llm";
import { describe, expect, it, vi } from "vitest";
import { SupplierInvoiceExtractionService } from "./supplier-invoice-extraction.js";

function fakeLLM(text: string | null): LLMClient & { complete: ReturnType<typeof vi.fn> } {
  const response: LLMResponse = {
    text,
    toolCalls: [],
    finishReason: "stop",
    usage: { promptTokens: 100, completionTokens: 50 },
  };
  return { complete: vi.fn().mockResolvedValue(response) };
}

const VALID = {
  supplierName: "Metro France",
  invoiceNumber: "F-2026-889",
  amountCents: 45050,
  currency: "eur",
  invoiceDate: "2026-07-01",
  dueDate: "2026-07-31",
  category: "matières premières",
  confidence: 0.92,
};

const FILE = { mimeType: "application/pdf", dataBase64: "JVBERi0xLjQ=" };

describe("SupplierInvoiceExtractionService", () => {
  it("extrait les champs et normalise la devise en majuscules", async () => {
    const llm = fakeLLM(JSON.stringify(VALID));
    const service = new SupplierInvoiceExtractionService(llm);

    const result = await service.extract(FILE);

    expect(result).toMatchObject({
      supplierName: "Metro France",
      amountCents: 45050,
      currency: "EUR",
      dueDate: "2026-07-31",
    });
    // Le fichier part bien en pièce jointe multimodale.
    const req = llm.complete.mock.calls[0]?.[0] as {
      messages: Array<{ attachments?: Array<{ mimeType: string }> }>;
    };
    expect(req.messages[0]?.attachments?.[0]?.mimeType).toBe("application/pdf");
  });

  it("tolère un JSON emballé dans des balises markdown", async () => {
    const service = new SupplierInvoiceExtractionService(
      fakeLLM(`\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``),
    );
    const result = await service.extract(FILE);
    expect(result.supplierName).toBe("Metro France");
  });

  it("rejette un document qui n'est pas une facture", async () => {
    const service = new SupplierInvoiceExtractionService(
      fakeLLM(JSON.stringify({ error: "not_an_invoice" })),
    );
    await expect(service.extract(FILE)).rejects.toMatchObject({ code: "not_an_invoice" });
  });

  it("rejette un JSON invalide ou incomplet", async () => {
    const service = new SupplierInvoiceExtractionService(fakeLLM("pas du json"));
    await expect(service.extract(FILE)).rejects.toMatchObject({ code: "extraction_invalid" });

    const incomplete = new SupplierInvoiceExtractionService(
      fakeLLM(JSON.stringify({ supplierName: "Metro" })),
    );
    await expect(incomplete.extract(FILE)).rejects.toMatchObject({ code: "extraction_invalid" });
  });

  it("rejette un LLM muet", async () => {
    const service = new SupplierInvoiceExtractionService(fakeLLM(null));
    await expect(service.extract(FILE)).rejects.toMatchObject({ code: "extraction_empty" });
  });
});
