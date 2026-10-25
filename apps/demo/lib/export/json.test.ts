import { describe, expect, it } from "vitest";
import { URL_EXPORT } from "@/test/export-fixture";
import { buildExportDocument } from "./build-document";
import { JSON_SCHEMA, toJson } from "./json";

describe("toJson", () => {
  const json = toJson(buildExportDocument(URL_EXPORT), { withFiles: true });
  const parsed = JSON.parse(json) as Record<string, unknown> & {
    comments: Array<Record<string, unknown>>;
  };

  it("is versioned, with ISO dates and counts", () => {
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
});
