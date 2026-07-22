/**
 * Extraction du calque texte d'un PDF (pas d'OCR).
 *
 * `pdf-parse` couvre le cas réaliste : un PDF émis par un logiciel de compta
 * embarque son texte de manière lisible — Gemini le lit très bien en vision,
 * mais échoue parfois (timeout, page rognée, PDF partiellement corrompu).
 * Le fallback consiste alors à re-soumettre au LLM le texte brut au lieu du
 * fichier binaire.
 *
 * Un PDF scanné (image plate) ne contient pas de calque texte : on renvoie
 * une chaîne trop courte, l'appelant retombera sur l'erreur d'origine. L'OCR
 * (Tesseract) ajouterait 20+ Mo de dépendances (WASM + modèle) pour un gain
 * marginal — à ajouter en second étage si les scans deviennent fréquents.
 */

import { logger } from "./logger.js";

/** Extracteur de texte PDF. Injectable pour les tests. */
export type PdfTextExtractor = (buffer: Buffer) => Promise<string>;

/**
 * Extracteur par défaut basé sur pdf-parse (import dynamique pour éviter la
 * pénalité de démarrage quand le fallback n'est jamais sollicité).
 */
export const defaultPdfTextExtractor: PdfTextExtractor = async (buffer) => {
  try {
    const mod = (await import("pdf-parse")) as {
      default?: (b: Buffer) => Promise<{ text: string }>;
    };
    const parse = mod.default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
    const result = await parse(buffer);
    return result.text ?? "";
  } catch (err) {
    logger.warn({ err }, "pdf-parse: extraction texte impossible");
    return "";
  }
};
