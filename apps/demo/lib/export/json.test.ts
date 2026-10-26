import { describe, expect, it } from "vitest";
import { PAGES_EXPORT, URL_EXPORT } from "@/test/export-fixture";
import { buildExportDocument } from "./build-document";
import { JSON_SCHEMA, toJson } from "./json";

describe("toJson", () => {
  const json = toJson(buildExportDocument(URL_EXPORT), { withFiles: true });
  const parsed = JSON.parse(json) as Record<string, unknown> & {
    comments: Array<Record<string, unknown>>;
  };

  it("is versioned, with ISO dates and counts", () => {
    expect(JSON_SCHEMA).toBe("squint.comments/2");
    expect(parsed.schema).toBe(JSON_SCHEMA);
    expect(parsed.exportedAt).toBe("2026-10-24T12:30:00.000Z");
    expect(parsed.filesIncluded).toBe(true);
    expect(parsed.counts).toEqual({ active: 2, resolved: 1 });
  });

  it("keeps user text exactly as written", () => {
    const hostile = URL_EXPORT.comments[2];
    expect(parsed.comments[1]).toMatchObject({
      number: 3,
      id: hostile?.id,
      author: hostile?.author,
      body: hostile?.body,
      edited: true,
      resolvedAt: null,
      screenshot: { file: "screenshots/03-cccc3333.png" },
    });
    expect(parsed.comments[2]?.resolvedAt).toBe("2026-10-24T09:00:40.000Z");
  });

  it("has stable field names", () => {
    expect(Object.keys(parsed)).toEqual([
      "schema",
      "exportedAt",
      "filesIncluded",
      "project",
      "counts",
      "snapshots",
      "comments",
    ]);
    expect(Object.keys(parsed.comments[0] ?? {})).toEqual([
      "number",
      "id",
      "status",
      "author",
      "body",
      "createdAt",
      "updatedAt",
      "resolvedAt",
      "location",
      "pageUrl",
      "screenshot",
      "edited",
    ]);
  });

  it("says which page each pin is on, in page px", () => {
    const deck = JSON.parse(toJson(buildExportDocument(PAGES_EXPORT), { withFiles: true })) as {
      project: { source: { kind: string; pages: Array<{ number: number; file: string | null }> } };
      comments: Array<{ location: Record<string, unknown> }>;
    };
    expect(deck.project.source.kind).toBe("pages");
    expect(deck.project.source.pages.map((page) => page.file)).toEqual([
      null,
      "pages/02.webp",
      "pages/03.webp",
    ]);
    expect(deck.comments[0]?.location).toEqual({
      surface: "page",
      snapshotId: null,
      page: { id: "c3", number: 3, name: "Page 3" },
      xPercent: 50,
      yPercent: 10,
      x: 800,
      y: 90,
      surfaceWidth: 1600,
      surfaceHeight: 900,
    });
  });
});
