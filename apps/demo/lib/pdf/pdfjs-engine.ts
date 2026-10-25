import type * as PdfJsModule from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFPageProxy } from "pdfjs-dist";
import { encodeCanvas, fitScale } from "../image";
import type { ImageUpload } from "../store/actions";
import { PdfOpenError, type PdfDocument, type PdfEngine } from "./render-pdf";

/**
 * pdf.js's worker, bundled with the app: webpack emits it as a static file of
 * its own (no CDN), and pdf.js starts one per document from it.
 */
const WORKER_URL = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

/** Small pages are drawn larger, up to this, so their longest edge can reach `MAX_EDGE`. */
const MAX_UPSCALE = 4;

type PdfJs = typeof PdfJsModule;

async function renderPage(
  pdfjs: PdfJs,
  page: PDFPageProxy,
  signal: AbortSignal,
): Promise<ImageUpload> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: fitScale(base.width, base.height, MAX_UPSCALE) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  // Appearances of annotations are painted as pixels; nothing on a canvas is a link or a form.
  const task = page.render({
    canvas,
    viewport,
    annotationMode: pdfjs.AnnotationMode.ENABLE,
    background: "#ffffff",
  });
  const cancel = () => task.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    await task.promise;
    const blob = await encodeCanvas(canvas);
    if (!blob) throw new Error("The page couldn't be encoded.");
    const { width, height } = canvas;
    return { blob, fileName: `Page ${page.pageNumber}`, width, height };
  } finally {
    signal.removeEventListener("abort", cancel);
    // Hand the bitmap back right away rather than at garbage collection.
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}

function documentOf(pdfjs: PdfJs, task: PDFDocumentLoadingTask, pageCount: number): PdfDocument {
  return {
    pageCount,
    async renderPage(number, signal) {
      const pdf = await task.promise;
      return renderPage(pdfjs, await pdf.getPage(number), signal);
    },
    // Destroying the loading task also ends the worker it started.
    destroy: () => task.destroy(),
  };
}

/**
 * pdf.js, loaded on first use. Locked down: no XFA, no WebAssembly, and no
 * fetching of anything (fonts, CMaps, ICC profiles); the bytes come from
 * memory. pdf.js 6 has no eval-based paths left (`isEvalSupported` is gone),
 * and its scripting sandbox is never loaded.
 */
export async function createPdfjsEngine(): Promise<PdfEngine> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
  return {
    async open(data) {
      const task = pdfjs.getDocument({
        data,
        enableXfa: false,
        useWasm: false,
        useWorkerFetch: false,
        disableAutoFetch: true,
        disableStream: true,
        disableRange: true,
        verbosity: pdfjs.VerbosityLevel.ERRORS,
      });
      try {
        const pdf = await task.promise;
        return documentOf(pdfjs, task, pdf.numPages);
      } catch (error) {
        await task.destroy();
        throw new PdfOpenError(error instanceof pdfjs.PasswordException ? "password" : "corrupt");
      }
    },
  };
}
