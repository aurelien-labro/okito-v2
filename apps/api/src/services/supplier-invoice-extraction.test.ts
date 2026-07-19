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

  describe("fallback texte pdf-parse", () => {
    const PDF_TEXT = `
      Metro France
      Facture n° F-2026-889
      Date : 01/07/2026
      Échéance : 31/07/2026
      Total TTC : 450,50 EUR
      Catégorie : matières premières
    `.repeat(3);

    it("relance en mode texte quand la vision renvoie vide, et réussit", async () => {
      const llm = {
        complete: vi
          .fn<LLMClient["complete"]>()
          // 1re passe : vision, muette
          .mockResolvedValueOnce({
            text: null,
            toolCalls: [],
            finishReason: "stop",
            usage: { promptTokens: 100, completionTokens: 0 },
          })
          // 2e passe : texte, réussit
          .mockResolvedValueOnce({
            text: JSON.stringify(VALID),
            toolCalls: [],
            finishReason: "stop",
            usage: { promptTokens: 300, completionTokens: 60 },
          }),
      };
      const extractor = vi.fn().mockResolvedValue(PDF_TEXT);
      const service = new SupplierInvoiceExtractionService(llm as unknown as LLMClient, extractor);

      const result = await service.extract(FILE);
      expect(result.supplierName).toBe("Metro France");
      expect(llm.complete).toHaveBeenCalledTimes(2);
      expect(extractor).toHaveBeenCalledOnce();
      // 2e appel : pas d'attachment, texte inline dans le content
      const second = llm.complete.mock.calls[1]?.[0] as {
        messages: Array<{ content: string; attachments?: unknown }>;
      };
      expect(second.messages[0]?.attachments).toBeUndefined();
      expect(second.messages[0]?.content).toContain("Metro France");
    });

    it("ne fallback PAS sur not_an_invoice (décision LLM, pas lecture ratée)", async () => {
      const llm = fakeLLM(JSON.stringify({ error: "not_an_invoice" }));
      const extractor = vi.fn().mockResolvedValue(PDF_TEXT);
      const service = new SupplierInvoiceExtractionService(llm, extractor);

      await expect(service.extract(FILE)).rejects.toMatchObject({ code: "not_an_invoice" });
      expect(extractor).not.toHaveBeenCalled();
    });

    it("ne fallback PAS sur une image (fallback réservé au PDF)", async () => {
      const llm = fakeLLM(null);
      const extractor = vi.fn().mockResolvedValue(PDF_TEXT);
      const service = new SupplierInvoiceExtractionService(llm, extractor);

      await expect(
        service.extract({ mimeType: "image/jpeg", dataBase64: "AAAA" }),
      ).rejects.toMatchObject({ code: "extraction_empty" });
      expect(extractor).not.toHaveBeenCalled();
    });

    it("laisse remonter l'erreur d'origine si le PDF n'a pas de calque texte", async () => {
      const llm = fakeLLM(null);
      const extractor = vi.fn().mockResolvedValue("trop court");
      const service = new SupplierInvoiceExtractionService(llm, extractor);

      await expect(service.extract(FILE)).rejects.toMatchObject({ code: "extraction_empty" });
      expect(extractor).toHaveBeenCalledOnce();
    });
  });
});
