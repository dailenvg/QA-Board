import { describe, expect, it } from "vitest";
import { IMAGE_EXPORT, URL_EXPORT } from "@/test/export-fixture";
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

  it("locates image pins on the image's natural size", () => {
    const image = buildExportDocument(IMAGE_EXPORT);
    expect(image.comments[0]?.location).toMatchObject({ surface: "image", x: 300, y: 450 });
    expect(image.project.source).toMatchObject({ kind: "image", file: "source-image.png" });
    expect(image.comments[0]?.pageUrl).toBeNull();
  });
});
