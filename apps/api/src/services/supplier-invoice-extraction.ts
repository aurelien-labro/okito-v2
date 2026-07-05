import type { LLMClient } from "@okito/shared/llm";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const EXTRACTION_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** ~6 Mo décodés — la limite inline de Gemini est bien au-dessus. */
export const EXTRACTION_MAX_BYTES = 6 * 1024 * 1024;

const SYSTEM_PROMPT = `Tu lis une facture fournisseur (PDF ou photo) pour un commerce français.
Extrais les champs et réponds UNIQUEMENT avec un objet JSON, sans texte autour, sans balises markdown :

{
  "supplierName": string,            // nom du fournisseur émetteur
  "invoiceNumber": string | null,    // numéro de facture tel qu'imprimé
  "amountCents": number,             // total TTC en CENTIMES (89,50 € → 8950)
  "currency": string,                // code ISO 3 lettres, "EUR" si non précisé
  "invoiceDate": string | null,      // date d'émission, format YYYY-MM-DD
  "dueDate": string | null,          // date d'échéance, format YYYY-MM-DD
  "category": string | null,         // catégorie courte : "matières premières", "énergie", "loyer", "télécom", "assurance", "équipement", "autre"
  "confidence": number               // 0 à 1, ta confiance globale
}

Règles :
- N'invente RIEN : un champ illisible ou absent → null (sauf amountCents et supplierName, obligatoires).
- Si le document n'est manifestement pas une facture, réponds {"error": "not_an_invoice"}.
- Le montant est le TOTAL TTC, pas le HT ni un sous-total.`;

const extractionSchema = z.object({
  supplierName: z.string().min(1).max(200),
  invoiceNumber: z.string().min(1).max(100).nullable(),
  amountCents: z.number().int().positive().max(100_000_000),
  currency: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase()),
  invoiceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  category: z.string().min(1).max(100).nullable(),
  confidence: z.number().min(0).max(1),
});

export type SupplierInvoiceExtraction = z.infer<typeof extractionSchema>;

/**
 * Extraction LLM d'une facture fournisseur (upload PDF/photo).
 *
 * Ne crée RIEN en base : retourne une proposition que le patron valide dans
 * le dashboard (la création passe par SupplierInvoiceService avec
 * source="upload" et le brut dans `extracted`). Gemini est multimodal, le
 * fichier part en inline_data — jamais stocké côté OKITO.
 */
export class SupplierInvoiceExtractionService {
  constructor(private readonly llm: LLMClient) {}

  async extract(file: {
    mimeType: string;
    dataBase64: string;
  }): Promise<SupplierInvoiceExtraction> {
    const response = await this.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: "Voici la facture à extraire.",
          attachments: [{ mimeType: file.mimeType, dataBase64: file.dataBase64 }],
        },
      ],
      temperature: 0,
      maxOutputTokens: 600,
    });

    const text = response.text?.trim();
    if (!text) {
      throw new BadRequestError("Le LLM n'a pas produit d'extraction", "extraction_empty");
    }

    const parsed = parseJson(stripFences(text));
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      throw new BadRequestError("Le document ne ressemble pas à une facture", "not_an_invoice");
    }

    const result = extractionSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ issues: result.error.issues }, "extraction facture : JSON invalide");
      throw new BadRequestError(
        "Extraction illisible — réessaie avec une photo plus nette",
        "extraction_invalid",
      );
    }
    return result.data;
  }
}

/** Gemini emballe parfois le JSON dans un bloc \`\`\`json malgré la consigne. */
function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError("Le LLM n'a pas renvoyé un JSON valide", "extraction_invalid");
  }
}
