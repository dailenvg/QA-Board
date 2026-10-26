import type { ImageUpload } from "../store/actions";
import { pageByteBudget } from "../page-budget";
import { MAX_PAGES } from "../store/pages";

/** Largest PDF accepted, before anything is read. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
/** Most pages one project takes from a PDF (a longer one offers its first ones). */
export const MAX_PDF_PAGES = MAX_PAGES;

/** Why pdf.js couldn't open a file. */
export type PdfOpenFailure = "password" | "corrupt";

/** Thrown by `renderPage` when a page can't be stored within its budget, even smaller. */
export class PdfPageTooDetailedError extends Error {
  constructor() {
    super("too-detailed");
    this.name = "PdfPageTooDetailedError";
  }
}

/** Thrown by an engine's `open` when pdf.js refuses the file. */
export class PdfOpenError extends Error {
  constructor(readonly reason: PdfOpenFailure) {
    super(reason);
    this.name = "PdfOpenError";
  }
}

/** An open PDF. Destroy it when done (or cancelled): that stops its worker and frees its memory. */
export interface PdfDocument {
  pageCount: number;
  /**
   * Page `number` (1-based) as a stored picture of at most `maxBytes`; rejects
   * if it can't be rendered (`PdfPageTooDetailedError` when it can't fit).
   */
  renderPage(number: number, signal: AbortSignal, maxBytes: number): Promise<ImageUpload>;
  destroy(): Promise<void>;
}

/** What opens PDFs: pdf.js in its worker (`pdfjs-engine.ts`), or a stand-in in tests. */
export interface PdfEngine {
  open(data: Uint8Array): Promise<PdfDocument>;
}

export const PDF_MESSAGES = {
  tooLarge: "That PDF is over 50 MB. Try a smaller one.",
  notPdf: "That file isn't a PDF. Choose a PDF file.",
  password: "That PDF is password-protected. Remove the password, then upload it again.",
  corrupt: "That PDF couldn't be read. It may be damaged. Try exporting it again.",
  empty: "That PDF has no pages. Choose another PDF.",
  /** The browser couldn't read the chosen file (moved, deleted or locked since it was chosen). */
  unreadable: "That file couldn't be read. Try choosing it again.",
  /** pdf.js itself couldn't be loaded (offline, or a failed download). */
  unavailable: "PDF support couldn't be loaded. Check your connection, then try again.",
  render: (page: number) =>
    `Page ${page} of that PDF couldn't be rendered, so nothing was added. Try exporting the PDF again.`,
  tooDetailed: (page: number) =>
    `Page ${page} of that PDF is too detailed to store, so nothing was added. Export the PDF at a lower resolution, then try again.`,
} as const;

/** `%PDF-`, which readers accept anywhere in the first 1 KB (some files carry a few bytes before it). */
const HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d];
const HEADER_WINDOW = 1024;

export function hasPdfHeader(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, HEADER_WINDOW) - HEADER.length;
  for (let start = 0; start <= end; start += 1) {
    if (HEADER.every((byte, index) => bytes[start + index] === byte)) return true;
  }
  return false;
}

export type OpenResult =
  { ok: true; document: PdfDocument; pageCount: number } | { ok: false; error: string };

/**
 * Checks a PDF before pdf.js sees it (size, then the `%PDF-` header), then
 * opens it. Every refusal comes back as a message; a PDF without pages is
 * closed again.
 */
export async function openPdf(file: Blob, engine: PdfEngine): Promise<OpenResult> {
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: PDF_MESSAGES.tooLarge };
  let head: Uint8Array;
  let bytes: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, HEADER_WINDOW).arrayBuffer());
    if (!hasPdfHeader(head)) return { ok: false, error: PDF_MESSAGES.notPdf };
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    // Reading the file failed (it moved or changed since it was chosen): not pdf.js's doing.
    return { ok: false, error: PDF_MESSAGES.unreadable };
  }
  let document: PdfDocument;
  try {
    document = await engine.open(bytes);
  } catch (error) {
    const reason = error instanceof PdfOpenError ? error.reason : "corrupt";
    return { ok: false, error: PDF_MESSAGES[reason] };
  }
  if (document.pageCount < 1) {
    await document.destroy();
    return { ok: false, error: PDF_MESSAGES.empty };
  }
  return { ok: true, document, pageCount: document.pageCount };
}

export type RenderResult =
  | { ok: true; pages: ImageUpload[] }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; error: string };

/**
 * Renders pages 1 to `count`, one at a time, reporting each as it starts.
 * Each page is stored within its share of the project's budget
 * (`pageByteBudget`), so a PDF of up to 50 pages fits in a share. All or
 * nothing: a page that fails fails the whole PDF (naming the page), and a
 * cancel stops after the page in progress. The caller destroys the document.
 */
export async function renderPdfPages(
  document: PdfDocument,
  count: number,
  options: { signal: AbortSignal; onProgress: (page: number, total: number) => void },
): Promise<RenderResult> {
  const { signal, onProgress } = options;
  const total = Math.min(count, document.pageCount);
  const budget = pageByteBudget(total);
  const pages: ImageUpload[] = [];
  for (let number = 1; number <= total; number += 1) {
    if (signal.aborted) return { ok: false, cancelled: true };
    onProgress(number, total);
    try {
      pages.push(await document.renderPage(number, signal, budget));
    } catch (error) {
      if (signal.aborted) return { ok: false, cancelled: true };
      const message =
        error instanceof PdfPageTooDetailedError
          ? PDF_MESSAGES.tooDetailed(number)
          : PDF_MESSAGES.render(number);
      return { ok: false, cancelled: false, error: message };
    }
  }
  return signal.aborted ? { ok: false, cancelled: true } : { ok: true, pages };
}
