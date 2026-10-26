import { openPdf, PDF_MESSAGES, type OpenResult, type PdfEngine } from "./render-pdf";

let loading: Promise<PdfEngine> | null = null;

/**
 * pdf.js and its engine, loaded the first time a PDF is chosen, so neither is
 * in any page's bundle. A failed load (offline) is tried again next time.
 */
export function loadPdfEngine(): Promise<PdfEngine> {
  loading ??= import("./pdfjs-engine").then((module) => module.createPdfjsEngine());
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * Opens a chosen PDF with pdf.js, loading pdf.js first. Each failure has its
 * own message: pdf.js not loading (`unavailable`) is told apart from the file
 * not reading (`unreadable`) and from the PDF itself being refused.
 */
export async function openChosenPdf(
  file: Blob,
  load: () => Promise<PdfEngine> = loadPdfEngine,
): Promise<OpenResult> {
  let engine: PdfEngine;
  try {
    engine = await load();
  } catch {
    return { ok: false, error: PDF_MESSAGES.unavailable };
  }
  return openPdf(file, engine);
}
