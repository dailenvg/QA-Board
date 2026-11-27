import { describe, expect, it } from "vitest";
import type { Project } from "@/lib/store/types";
import {
  isFiltered,
  matchesFilter,
  NO_FILTER,
  noMatchKind,
  stageFilterLabel,
  type ProjectFilter,
} from "./status-filter";

const project = (over: Partial<Project> = {}): Project => ({
  id: "p1",
  folderId: "f1",
  name: "P",
  source: { kind: "url", url: "https://acme.example/" },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const by = (over: Partial<ProjectFilter>): ProjectFilter => ({ ...NO_FILTER, ...over });

describe("matchesFilter with a stage", () => {
  const approved = project({ stage: "approved", stageChangedAt: 2, label: "Urgent" });
  const none = project({ label: "Urgent" });

  it("shows every project for All stages, and only those without one for No stage", () => {
    expect(matchesFilter(approved, "comments", by({ stage: "all" }))).toBe(true);
    expect(matchesFilter(none, "comments", by({ stage: "all" }))).toBe(true);
    expect(matchesFilter(approved, "comments", by({ stage: "none" }))).toBe(false);
    expect(matchesFilter(none, "comments", by({ stage: "none" }))).toBe(true);
  });

  it("shows only the projects at the chosen stage", () => {
    expect(matchesFilter(approved, "ready", by({ stage: "approved" }))).toBe(true);
    expect(matchesFilter(approved, "ready", by({ stage: "on-hold" }))).toBe(false);
    expect(matchesFilter(none, "ready", by({ stage: "approved" }))).toBe(false);
  });

  it("ANDs the stage with the status and the label", () => {
    const filter = by({ status: "comments", label: "Urgent", stage: "approved" });
    expect(matchesFilter(approved, "comments", filter)).toBe(true);
    expect(matchesFilter(approved, "resolved", filter)).toBe(false);
    expect(matchesFilter({ ...approved, label: "Later" }, "comments", filter)).toBe(false);
    expect(matchesFilter({ ...approved, stage: "editing" }, "comments", filter)).toBe(false);
  });

  it("leaves archived projects to Archived, whatever their stage", () => {
    const archived = { ...approved, archivedAt: 5, deleteAfter: 9 };
    expect(matchesFilter(archived, "comments", by({ stage: "approved" }))).toBe(false);
    expect(matchesFilter(archived, "comments", by({ status: "archived", stage: "approved" }))).toBe(
      true,
    );
  });
});

describe("the stage filter's state", () => {
  it("counts a stage as filtering", () => {
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered(by({ stage: "none" }))).toBe(true);
    expect(isFiltered(by({ stage: "on-hold" }))).toBe(true);
  });

  it("shows the stage's empty state whenever a stage is chosen", () => {
    expect(noMatchKind(by({ stage: "approved", label: "Urgent" }), "folder")).toBe("stage");
    expect(noMatchKind(by({ stage: "none", status: "archived" }), "folders")).toBe("foldersStage");
    expect(noMatchKind(by({ label: "Urgent" }), "folder")).toBe("label");
    expect(noMatchKind(by({ label: "Urgent" }), "folders")).toBe("foldersLabel");
    expect(noMatchKind(by({ status: "archived" }), "folders")).toBe("foldersArchived");
    expect(noMatchKind(by({ status: "ready" }), "folders")).toBe("folders");
    expect(noMatchKind(by({ status: "ready" }), "folder")).toBe("filter");
  });

  it("names each choice as its trigger says it", () => {
    expect(stageFilterLabel("all")).toBe("All stages");
    expect(stageFilterLabel("none")).toBe("No stage");
    expect(stageFilterLabel("open-for-review")).toBe("With client");
    expect(stageFilterLabel("on-hold")).toBe("On hold");
  });
});
