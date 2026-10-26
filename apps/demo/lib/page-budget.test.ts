import { describe, expect, it } from "vitest";
import { MAX_PICTURE_BYTES } from "./image";
import { fitPages, pageByteBudget, PAGES_SHARE_BYTES } from "./page-budget";
import { renderPdfPages, type PdfDocument } from "./pdf/render-pdf";
import { MB, SHARE_LIMITS } from "./share/limits";
import { shareSizeProblem, type ShareImage } from "./share-client/share-size";

/** A picture of exactly `size` bytes. */
const picture = (size: number, fileName = "a.png") => ({
  blob: new Blob([new Uint8Array(size)]),
  fileName,
  width: 1600,
  height: 1200,
});

/** What a share of these pages holds, plus room-filling extras a reviewed project has. */
function withExtras(pages: ReadonlyArray<{ blob: Blob }>): ShareImage[] {
  return [
    ...pages.map((page, index) => ({
      kind: "page" as const,
      size: page.blob.size,
      label: `page ${index + 1}`,
    })),
    // A busy review: 20 comment screenshots of 300 KB.
    ...Array.from({ length: 20 }, () => ({ kind: "crop" as const, size: 300 * 1024 })),
  ];
}

describe("page budget", () => {
  it("keeps a single image and short projects at full quality, then shares 32 MB", () => {
    expect(pageByteBudget(1)).toBe(MAX_PICTURE_BYTES);
    expect(pageByteBudget(27)).toBe(MAX_PICTURE_BYTES);
    expect(pageByteBudget(28)).toBeLessThan(MAX_PICTURE_BYTES);
    expect(pageByteBudget(50)).toBe(Math.floor((32 * MB) / 50));
    expect(PAGES_SHARE_BYTES + 8 * MB).toBe(SHARE_LIMITS.totalBytes);
  });

  it("fits 50 combined images in a share, re-encoding only those over budget", async () => {
    const budget = pageByteBudget(50);
    const images = [
      picture(budget - 10),
      ...Array.from({ length: 49 }, () => picture(MAX_PICTURE_BYTES)),
    ];
    const fitted: number[] = [];
    const result = await fitPages(images, (image, maxBytes) => {
      fitted.push(maxBytes);
      return Promise.resolve({ ...image, blob: new Blob([new Uint8Array(maxBytes)]) });
    });
    if (!result.ok) throw new Error("did not fit");
    expect(result.pictures[0]).toBe(images[0]);
    expect(fitted).toHaveLength(49);
    expect(fitted.every((maxBytes) => maxBytes === budget)).toBe(true);
    // Before: 50 × 1.2 MB is over the share's 40 MB. After: it fits, with screenshots.
    expect(shareSizeProblem(withExtras(images))).not.toBeNull();
    expect(shareSizeProblem(withExtras(result.pictures))).toBeNull();
  });

  it("says which image can't fit", async () => {
    const images = Array.from({ length: 30 }, (_, index) =>
      picture(MAX_PICTURE_BYTES, `${index}.png`),
    );
    const result = await fitPages(images, (image) =>
      Promise.resolve(image.fileName === "7.png" ? null : { ...image, blob: new Blob(["x"]) }),
    );
    expect(result).toEqual({ ok: false, index: 7 });
  });

  it("renders a 50-page PDF within the budget, so it fits in a share", async () => {
    const asked: number[] = [];
    const document: PdfDocument = {
      pageCount: 50,
      renderPage: (number, _signal, maxBytes) => {
        asked.push(maxBytes);
        // A detailed page uses all it's allowed.
        return Promise.resolve(picture(maxBytes, `Page ${number}`));
      },
      destroy: () => Promise.resolve(),
    };
    const result = await renderPdfPages(document, 50, {
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    if (!result.ok) throw new Error("render failed");
    expect(new Set(asked)).toEqual(new Set([pageByteBudget(50)]));
    expect(shareSizeProblem(withExtras(result.pages))).toBeNull();
  });
});
