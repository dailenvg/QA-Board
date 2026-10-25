import { describe, expect, it } from "vitest";
import { openChosenPdf } from "./load-engine";
import { PDF_MESSAGES, type PdfEngine } from "./render-pdf";

const encoder = new TextEncoder();

/** An engine that opens anything as a one-page document. */
const engine: PdfEngine = {
  open: () =>
    Promise.resolve({
      pageCount: 1,
      renderPage: () => Promise.reject(new Error("unused")),
      destroy: () => Promise.resolve(),
    }),
};

/** A chosen file the browser can no longer read (moved or changed since it was picked). */
function unreadableFile(): Blob {
  const fail = () =>
    Promise.reject(new DOMException("The file could not be read.", "NotReadableError"));
  return Object.assign(new Blob(["%PDF-1.7"]), {
    arrayBuffer: fail,
    slice: () => ({ arrayBuffer: fail }) as unknown as Blob,
  });
}

describe("openChosenPdf", () => {
  it("opens a PDF once pdf.js is loaded", async () => {
    const result = await openChosenPdf(new Blob([encoder.encode("%PDF-1.7")]), () =>
      Promise.resolve(engine),
    );
    expect(result).toMatchObject({ ok: true, pageCount: 1 });
  });

  it("says pdf.js couldn't be loaded only when loading it fails", async () => {
    const result = await openChosenPdf(new Blob([encoder.encode("%PDF-1.7")]), () =>
      Promise.reject(new Error("ChunkLoadError")),
    );
    expect(result).toEqual({ ok: false, error: PDF_MESSAGES.unavailable });
  });

  it("says the file couldn't be read when reading it fails, not that pdf.js is missing", async () => {
    const result = await openChosenPdf(unreadableFile(), () => Promise.resolve(engine));
    expect(result).toEqual({ ok: false, error: PDF_MESSAGES.unreadable });
    expect(PDF_MESSAGES.unreadable).toBe("That file couldn't be read. Try choosing it again.");
  });
});
