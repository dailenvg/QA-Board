import type { PdfEngine } from "./render-pdf";

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
