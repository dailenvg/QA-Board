import { describe, expect, it, vi } from "vitest";
import {
  hasPdfHeader,
  MAX_PDF_BYTES,
  openPdf,
  PDF_MESSAGES,
  PdfOpenError,
  renderPdfPages,
  type PdfDocument,
  type PdfEngine,
} from "./render-pdf";

const encoder = new TextEncoder();
const pdfFile = (body = "%PDF-1.7\n...") => new Blob([encoder.encode(body)]);

/** A stand-in document: `fail` pages reject; `onRender` runs as each page starts. */
function fakeDocument(
  pageCount: number,
  options: { fail?: number; onRender?: (page: number) => void } = {},
): PdfDocument & { destroyed: boolean; rendered: number[] } {
  const document = {
    pageCount,
    destroyed: false,
    rendered: [] as number[],
    renderPage(number: number) {
      options.onRender?.(number);
      if (number === options.fail) return Promise.reject(new Error("bad page"));
      document.rendered.push(number);
      return Promise.resolve({
        blob: new Blob(["x"]),
        fileName: `Page ${number}`,
        width: 1600,
        height: 900,
      });
    },
    destroy() {
      document.destroyed = true;
      return Promise.resolve();
    },
  };
  return document;
}

/** An engine whose `open` is a spy, returned alongside it. */
function engineFor(implementation: PdfEngine["open"]) {
  const open = vi.fn(implementation);
  const engine: PdfEngine = { open };
  return Object.assign(engine, { spy: open });
}

describe("openPdf", () => {
  it("refuses a file over 50 MB before reading it", async () => {
    const engine = engineFor(() => Promise.resolve(fakeDocument(1)));
    const big = { size: MAX_PDF_BYTES + 1 } as Blob;
    expect(await openPdf(big, engine)).toEqual({ ok: false, error: PDF_MESSAGES.tooLarge });
    expect(engine.spy).not.toHaveBeenCalled();
  });

  it("checks the %PDF- header before pdf.js sees the file", async () => {
    const engine = engineFor(() => Promise.resolve(fakeDocument(1)));
    expect(await openPdf(new Blob(["<html>"]), engine)).toEqual({
      ok: false,
      error: PDF_MESSAGES.notPdf,
    });
    expect(engine.spy).not.toHaveBeenCalled();
    expect(hasPdfHeader(encoder.encode("﻿ junk %PDF-1.4"))).toBe(true);
    expect(hasPdfHeader(encoder.encode(`${" ".repeat(1100)}%PDF-1.4`))).toBe(false);
  });

  it("says when a PDF is password-protected, damaged or empty", async () => {
    const refuse = (reason: "password" | "corrupt") =>
      engineFor(() => Promise.reject(new PdfOpenError(reason)));
    expect(await openPdf(pdfFile(), refuse("password"))).toEqual({
      ok: false,
      error: PDF_MESSAGES.password,
    });
    expect(await openPdf(pdfFile(), refuse("corrupt"))).toEqual({
      ok: false,
      error: PDF_MESSAGES.corrupt,
    });
    const other = engineFor(() => Promise.reject(new Error("Invalid PDF structure")));
    expect(await openPdf(pdfFile(), other)).toEqual({ ok: false, error: PDF_MESSAGES.corrupt });
    const empty = fakeDocument(0);
    expect(
      await openPdf(
        pdfFile(),
        engineFor(() => Promise.resolve(empty)),
      ),
    ).toEqual({
      ok: false,
      error: PDF_MESSAGES.empty,
    });
    expect(empty.destroyed).toBe(true);
  });

  it("hands over the whole file and reports how many pages it has", async () => {
    const document = fakeDocument(72);
    const engine = engineFor(() => Promise.resolve(document));
    const result = await openPdf(pdfFile("%PDF-1.7 body"), engine);
    expect(result).toMatchObject({ ok: true, pageCount: 72 });
    expect(engine.spy).toHaveBeenCalledWith(encoder.encode("%PDF-1.7 body"));
  });
});

describe("renderPdfPages", () => {
  it("renders pages in order, reporting each as it starts", async () => {
    const document = fakeDocument(3);
    const progress: Array<[number, number]> = [];
    const result = await renderPdfPages(document, 3, {
      signal: new AbortController().signal,
      onProgress: (page, total) => progress.push([page, total]),
    });
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(result.ok && result.pages.map((page) => page.fileName)).toEqual([
      "Page 1",
      "Page 2",
      "Page 3",
    ]);
  });

  it("takes only the first pages asked for", async () => {
    const document = fakeDocument(72);
    const result = await renderPdfPages(document, 50, {
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    expect(result.ok && result.pages).toHaveLength(50);
    expect(document.rendered.at(-1)).toBe(50);
  });

  it("stops on cancel, after the page in progress, with nothing to keep", async () => {
    const controller = new AbortController();
    const document = fakeDocument(10, {
      onRender: (page) => {
        if (page === 3) controller.abort();
      },
    });
    const result = await renderPdfPages(document, 10, {
      signal: controller.signal,
      onProgress: () => {},
    });
    expect(result).toEqual({ ok: false, cancelled: true });
    expect(document.rendered).toEqual([1, 2, 3]);
  });

  it("fails the whole PDF, naming the page, when one page can't be rendered", async () => {
    const document = fakeDocument(5, { fail: 4 });
    const result = await renderPdfPages(document, 5, {
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    expect(result).toEqual({ ok: false, cancelled: false, error: PDF_MESSAGES.render(4) });
    expect(PDF_MESSAGES.render(4)).toContain("Page 4");
    expect(document.rendered).toEqual([1, 2, 3]);
  });

  it("treats a page rejected by a cancel as cancelled, not failed", async () => {
    const controller = new AbortController();
    const document = fakeDocument(3, {
      fail: 2,
      onRender: (page) => {
        if (page === 2) controller.abort();
      },
    });
    const result = await renderPdfPages(document, 3, {
      signal: controller.signal,
      onProgress: () => {},
    });
    expect(result).toEqual({ ok: false, cancelled: true });
  });
});
