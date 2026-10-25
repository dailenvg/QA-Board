import { describe, expect, it } from "vitest";
import { IMAGE_EXPORT, PAGES_EXPORT, URL_EXPORT } from "@/test/export-fixture";
import { buildExportDocument } from "./build-document";

describe("buildExportDocument", () => {
  const document = buildExportDocument(URL_EXPORT);

  it("lists active comments first, each in pin order", () => {
    expect(document.comments.map((comment) => [comment.number, comment.status])).toEqual([
      [1, "active"],
      [3, "active"],
      [2, "resolved"],
    ]);
  });

  it("locates pins in page px on their snapshot, and leaves frame pins in percent", () => {
    const [legacy, latest] = document.comments;
    expect(legacy?.location).toMatchObject({ surface: "frame", x: null, surfaceWidth: null });
    expect(latest?.location).toEqual({
      surface: "snapshot",
      snapshotId: "snap-new",
      page: null,
      xPercent: 33.33,
      yPercent: 75.5,
      x: 427,
      y: 3020,
      surfaceWidth: 1280,
      surfaceHeight: 4000,
    });
    expect(latest?.pageUrl).toBe("https://acme.example/pricing?plan=pro");
  });

  it("links screenshots that are stored, and only the snapshots comments use", () => {
    expect(document.comments.map((comment) => comment.screenshot?.file ?? null)).toEqual([
      null,
      "screenshots/03-cccc3333.png",
      "screenshots/02-bbbb2222.png",
    ]);
    expect(document.snapshots.map(({ id, file, omitted }) => ({ id, file, omitted }))).toEqual([
      { id: "snap-old", file: null, omitted: "too-large" },
      { id: "snap-new", file: "snapshots/snap-new.jpg", omitted: null },
    ]);
  });

  it("drops the screenshot link when the crop isn't stored", () => {
    const missing = buildExportDocument({
      ...URL_EXPORT,
      assets: { ...URL_EXPORT.assets, crops: new Set() },
    });
    expect(missing.comments.every((comment) => comment.screenshot === null)).toBe(true);
  });

  it("locates image pins on the page's natural size, read from the image when not recorded", () => {
    const image = buildExportDocument(IMAGE_EXPORT);
    expect(image.comments[0]?.location).toMatchObject({
      surface: "page",
      page: { id: "page-1", number: 1, name: "checkout.png" },
      x: 300,
      y: 450,
      surfaceWidth: 1200,
    });
    expect(image.project.source).toEqual({
      kind: "pages",
      origin: "image",
      fileName: "checkout.png",
      referenceUrl: null,
      pages: [
        {
          id: "page-1",
          number: 1,
          name: "checkout.png",
          width: 1200,
          height: 900,
          file: "pages/01.png",
          omitted: null,
        },
      ],
    });
    expect(image.comments[0]?.pageUrl).toBeNull();
  });

  it("numbers pages in reading order and names each screenshot's page", () => {
    const deck = buildExportDocument(PAGES_EXPORT);
    expect(
      deck.comments.map((comment) => [
        comment.number,
        comment.location.page?.number,
        comment.location.x,
        comment.location.y,
        comment.screenshot?.file,
      ]),
    ).toEqual([
      [1, 3, 800, 90, "screenshots/01-p03-eeee5555.png"],
      [2, 2, 800, 90, "screenshots/02-p02-ffff6666.png"],
    ]);
    const source = deck.project.source;
    expect(
      source.kind === "pages" &&
        source.pages.map(({ number, file, omitted }) => [number, file, omitted]),
    ).toEqual([
      [1, null, "too-large"],
      [2, "pages/02.webp", null],
      [3, "pages/03.webp", null],
    ]);
  });
});
