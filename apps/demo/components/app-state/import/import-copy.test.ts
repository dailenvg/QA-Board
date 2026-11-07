import { describe, expect, it } from "vitest";
import { dialogText, progressFraction, skippedLines, summaryLine } from "./import-copy";

const REPORT = { projects: 1, comments: 3, files: 2, skipped: [], cleared: true };

describe("the import dialog's copy", () => {
  it("asks about projects, or about folders when there are only folders", () => {
    const offer = (projects: number, folders: number) =>
      dialogText({ view: "offer", counts: { projects, folders, comments: 0 } }, "Acme").title;
    expect(offer(3, 2)).toBe("Import 3 projects into Acme?");
    expect(offer(1, 1)).toBe("Import 1 project into Acme?");
    expect(offer(0, 2)).toBe("Import 2 folders into Acme?");
  });

  it("sums up what came in", () => {
    expect(summaryLine(REPORT, "Acme")).toBe("1 project, 3 comments and 2 images are now in Acme.");
  });

  it("says once per project and reason what was left out, counting repeats together", () => {
    expect(
      skippedLines([
        { kind: "project", projectName: "Site", reason: "other-workspace" },
        { kind: "file", projectName: "Deck", reason: "file-missing" },
        { kind: "file", projectName: "Deck", reason: "file-missing" },
        { kind: "comments", projectName: "Deck", reason: "no-surface", count: 1 },
      ]),
    ).toEqual([
      "Site already belongs to another workspace, so it wasn't imported.",
      "Deck: 2 images are no longer saved in this browser.",
      "Deck: 1 comment was on a page or snapshot that no longer exists.",
    ]);
  });

  it("fills the bar with projects first, then images", () => {
    expect(progressFraction(null)).toBe(0);
    expect(progressFraction({ stage: "projects", done: 1, total: 2 })).toBe(0.25);
    expect(progressFraction({ stage: "files", done: 0, total: 0 })).toBe(1);
    expect(progressFraction({ stage: "files", done: 2, total: 4 })).toBe(0.75);
  });
});
