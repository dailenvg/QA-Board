import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdfEngine } from "@/lib/pdf/load-engine";
import { MAX_PDF_PAGES, openPdf, renderPdfPages, type PdfDocument } from "@/lib/pdf/render-pdf";
import type { ImageUpload } from "@/lib/store/actions";

/** Where a chosen PDF is on its way to pages. */
export type PdfImport =
  | { status: "idle" }
  | { status: "opening"; fileName: string }
  /** Over the page limit: waiting for "Use the first 50 pages" or Cancel. */
  | { status: "confirm"; fileName: string; pageCount: number }
  | { status: "rendering"; fileName: string; page: number; total: number }
  | { status: "ready"; fileName: string; pages: ImageUpload[] }
  | { status: "failed"; fileName: string; error: string };

const UNAVAILABLE = "PDF support couldn't be loaded. Check your connection, then try again.";

/**
 * Opens a chosen PDF in pdf.js and renders its pages to stored-size
 * pictures, one at a time. Cancel (or choosing another file, or leaving)
 * stops the render and destroys the document, which ends its worker.
 */
export function usePdfImport() {
  const [state, setState] = useState<PdfImport>({ status: "idle" });
  const job = useRef<{ controller: AbortController; document: PdfDocument | null } | null>(null);

  const stop = useCallback(() => {
    const current = job.current;
    job.current = null;
    if (!current) return;
    current.controller.abort();
    void current.document?.destroy();
  }, []);

  useEffect(() => stop, [stop]);

  const render = useCallback(
    async (fileName: string, count: number) => {
      const current = job.current;
      if (!current?.document) return;
      const { controller, document } = current;
      const result = await renderPdfPages(document, count, {
        signal: controller.signal,
        onProgress: (page, total) => setState({ status: "rendering", fileName, page, total }),
      });
      if (job.current !== current) return;
      stop();
      if (result.ok) setState({ status: "ready", fileName, pages: result.pages });
      else if (!result.cancelled) setState({ status: "failed", fileName, error: result.error });
    },
    [stop],
  );

  const choose = useCallback(
    async (file: File) => {
      stop();
      const current = { controller: new AbortController(), document: null as PdfDocument | null };
      job.current = current;
      const fileName = file.name;
      setState({ status: "opening", fileName });
      let opened: Awaited<ReturnType<typeof openPdf>>;
      try {
        opened = await openPdf(file, await loadPdfEngine());
      } catch {
        opened = { ok: false, error: UNAVAILABLE };
      }
      if (job.current !== current) {
        if (opened.ok) void opened.document.destroy();
        return;
      }
      if (!opened.ok) {
        job.current = null;
        setState({ status: "failed", fileName, error: opened.error });
        return;
      }
      current.document = opened.document;
      if (opened.pageCount > MAX_PDF_PAGES) {
        setState({ status: "confirm", fileName, pageCount: opened.pageCount });
        return;
      }
      await render(fileName, opened.pageCount);
    },
    [render, stop],
  );

  /** "Use the first 50 pages" on a longer PDF. */
  const takeFirstPages = useCallback(() => {
    if (state.status === "confirm") void render(state.fileName, MAX_PDF_PAGES);
  }, [render, state]);

  /** Stops whatever is under way and forgets the PDF. */
  const cancel = useCallback(() => {
    stop();
    setState({ status: "idle" });
  }, [stop]);

  return { state, choose, takeFirstPages, cancel };
}
