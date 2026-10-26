import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "@/lib/store/selectors";
import type { ProjectStatus } from "@/lib/store/status";
import type { ProjectSource } from "@/lib/store/types";
import { DEFAULT_SORT, SORT_SPECS, parseSort, sortProjects } from "./project-sort";

const WEBSITE: ProjectSource = { kind: "url", url: "https://example.com/" };
const IMAGE: ProjectSource = { kind: "pages", origin: "image", fileName: "a.png", pages: [] };
const SCREENSHOT: ProjectSource = { ...IMAGE, referenceUrl: "https://example.com/" };
const PDF: ProjectSource = { kind: "pages", origin: "pdf", fileName: "a.pdf", pages: [] };

function summary(
  name: string,
  updatedAt: number,
  { status = "ready", source = WEBSITE }: { status?: ProjectStatus; source?: ProjectSource } = {},
): ProjectSummary {
  return {
    project: { id: name, folderId: "f", name, source, createdAt: 0, updatedAt },
    counts: { active: 0, resolved: 0 },
    status,
    previewKey: null,
  };
}

const names = (summaries: readonly ProjectSummary[]) =>
  summaries.map((entry) => entry.project.name);

describe("sortProjects by date", () => {
  const list = [summary("Old", 1), summary("New", 3), summary("Middle", 2)];

  it("puts the most recently updated first by default", () => {
    expect(names(sortProjects(list, "date", SORT_SPECS.date.natural))).toEqual([
      "New",
      "Middle",
      "Old",
    ]);
  });

  it("puts the oldest first when reversed", () => {
    expect(names(sortProjects(list, "date", "asc"))).toEqual(["Old", "Middle", "New"]);
  });

  it("breaks ties by name in both directions", () => {
    const tied = [summary("Beta", 5), summary("Alpha", 5), summary("Gamma", 9)];
    expect(names(sortProjects(tied, "date", "desc"))).toEqual(["Gamma", "Alpha", "Beta"]);
    expect(names(sortProjects(tied, "date", "asc"))).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});

describe("sortProjects by name", () => {
  it("ignores case and accents and orders numbers by value", () => {
    const list = [
      summary("banner 10", 1),
      summary("Banner 2", 1),
      summary("Éclair", 1),
      summary("apple", 1),
      summary("Zebra", 1),
    ];
    expect(names(sortProjects(list, "name", SORT_SPECS.name.natural))).toEqual([
      "apple",
      "Banner 2",
      "banner 10",
      "Éclair",
      "Zebra",
    ]);
    expect(names(sortProjects(list, "name", "desc"))).toEqual([
      "Zebra",
      "Éclair",
      "banner 10",
      "Banner 2",
      "apple",
    ]);
  });

  it("breaks ties by newest first in both directions", () => {
    const list = [summary("Same", 1), summary("Same", 3), summary("Other", 2)];
    const updated = (sorted: ProjectSummary[]) => sorted.map((entry) => entry.project.updatedAt);
    expect(updated(sortProjects(list, "name", "asc"))).toEqual([2, 3, 1]);
    expect(updated(sortProjects(list, "name", "desc"))).toEqual([3, 1, 2]);
  });
});

describe("sortProjects by status", () => {
  const list = [
    summary("Done", 1, { status: "resolved" }),
    summary("Fresh", 2, { status: "ready" }),
    summary("Open old", 3, { status: "comments" }),
    summary("Open new", 4, { status: "comments" }),
  ];

  it("puts open comments first, then ready, then resolved", () => {
    expect(names(sortProjects(list, "status", SORT_SPECS.status.natural))).toEqual([
      "Open new",
      "Open old",
      "Fresh",
      "Done",
    ]);
  });

  it("puts resolved first when reversed, ties still newest first", () => {
    expect(names(sortProjects(list, "status", "desc"))).toEqual([
      "Done",
      "Fresh",
      "Open new",
      "Open old",
    ]);
  });
});

describe("sortProjects by file type", () => {
  const list = [
    summary("Deck", 1, { source: PDF }),
    summary("Shot", 2, { source: SCREENSHOT }),
    summary("Site", 3, { source: WEBSITE }),
    summary("Mockup", 4, { source: IMAGE }),
  ];

  it("puts websites, then images (screenshots included), then PDFs; ties by name", () => {
    expect(names(sortProjects(list, "fileType", SORT_SPECS.fileType.natural))).toEqual([
      "Site",
      "Mockup",
      "Shot",
      "Deck",
    ]);
  });

  it("puts PDFs first when reversed, ties still by name", () => {
    expect(names(sortProjects(list, "fileType", "desc"))).toEqual([
      "Deck",
      "Mockup",
      "Shot",
      "Site",
    ]);
  });
});

describe("sortProjects", () => {
  it("returns a copy and leaves its input alone", () => {
    const list = [summary("B", 1), summary("A", 2)];
    const sorted = sortProjects(list, "name", "asc");
    expect(sorted).not.toBe(list);
    expect(names(list)).toEqual(["B", "A"]);
  });

  it("keeps full ties in their input order", () => {
    const first = summary("Same", 1);
    const second = { ...summary("Same", 1), previewKey: "second" };
    expect(sortProjects([first, second], "name", "asc")).toEqual([first, second]);
    expect(sortProjects([first, second], "name", "desc")).toEqual([first, second]);
  });

  it("handles an empty folder", () => {
    expect(sortProjects([], "status", "asc")).toEqual([]);
  });
});

describe("parseSort", () => {
  it("reads a stored choice", () => {
    expect(parseSort(JSON.stringify({ key: "name", direction: "desc" }))).toEqual({
      key: "name",
      direction: "desc",
    });
  });

  it("falls back to newest first for missing, broken or unknown values", () => {
    expect(DEFAULT_SORT).toEqual({ key: "date", direction: "desc" });
    for (const raw of [
      null,
      "",
      "{",
      "null",
      '"name"',
      JSON.stringify({ key: "size", direction: "asc" }),
      JSON.stringify({ key: "name", direction: "up" }),
    ]) {
      expect(parseSort(raw)).toEqual(DEFAULT_SORT);
    }
  });
});
