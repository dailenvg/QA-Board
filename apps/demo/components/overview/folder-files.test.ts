import { describe, expect, it } from "vitest";
import type { Comment, Folder, Project, SquintData } from "@/lib/store/types";
import type { ProjectFilter, StatusFilterValue } from "../dashboard/status-filter";
import { folderFiles, foldersMatching, projectsMatching } from "./folder-files";
import { folderStats } from "./folder-sort";

function folder(id: string, parentId: string | null = null): Folder {
  return { id, name: id, createdAt: 0, parentId };
}

function project(id: string, folderId: string, updatedAt = 0): Project {
  return {
    id,
    folderId,
    name: id,
    source: { kind: "url", url: "https://example.com/" },
    createdAt: updatedAt,
    updatedAt,
  };
}

function comment(id: string, projectId: string, status: Comment["status"]): Comment {
  return { id, projectId, x: 0, y: 0, body: "", author: "Ana", status, createdAt: 0, updatedAt: 0 };
}

/** Alpha holds a ready project and, in its subfolder Beta, one with comments; Gamma one resolved. */
const DATA: SquintData = {
  version: 3,
  folders: [folder("alpha"), folder("beta", "alpha"), folder("gamma")],
  projects: [project("ready", "alpha", 1), project("busy", "beta", 2), project("done", "gamma", 3)],
  comments: [comment("c1", "busy", "active"), comment("c2", "done", "resolved")],
  snapshots: [],
  authorName: null,
};
const TOP = DATA.folders.filter((entry) => entry.parentId === null);
const by = (status: StatusFilterValue, label: string | null = null): ProjectFilter => ({
  status,
  label,
});
const ids = (items: ReadonlyArray<{ id: string }>) => items.map((item) => item.id);

describe("folders by status", () => {
  it("counts a folder's projects with a status, subfolders included", () => {
    expect(ids(projectsMatching(DATA, "alpha"))).toEqual(["ready", "busy"]);
    expect(ids(projectsMatching(DATA, "alpha", by("comments")))).toEqual(["busy"]);
    expect(ids(projectsMatching(DATA, "alpha", by("resolved")))).toEqual([]);
    expect(ids(folderFiles(DATA, "alpha", by("ready")))).toEqual(["ready"]);
  });

  it("keeps the folders that hold a project with the status; all of them for All", () => {
    expect(ids(foldersMatching(DATA, TOP, by("all")))).toEqual(["alpha", "gamma"]);
    expect(ids(foldersMatching(DATA, TOP, by("comments")))).toEqual(["alpha"]);
    expect(ids(foldersMatching(DATA, TOP, by("resolved")))).toEqual(["gamma"]);
    expect(ids(foldersMatching(DATA, [folder("empty")], by("ready")))).toEqual([]);
  });

  it("sorts filtered folders by their matching projects only", () => {
    expect(folderStats(DATA, TOP, by("comments")).map((entry) => entry.projects)).toEqual([1, 0]);
    expect(folderStats(DATA, TOP, by("comments"))[0]).toMatchObject({
      updatedAt: 2,
      openComments: true,
    });
    expect(folderStats(DATA, TOP).map((entry) => entry.projects)).toEqual([2, 1]);
  });
});

describe("folders with archived and labelled projects", () => {
  /** Busy is archived; Done and Ready carry labels. */
  const TAGGED: SquintData = {
    ...DATA,
    projects: [
      { ...project("ready", "alpha", 1), label: "Draft" },
      { ...project("busy", "beta", 2), archivedAt: 5, deleteAfter: 9, label: "Draft" },
      { ...project("done", "gamma", 3), label: "Final" },
    ],
  };

  it("leaves archived projects out of every choice but Archived, which shows only them", () => {
    expect(ids(projectsMatching(TAGGED, "alpha"))).toEqual(["ready"]);
    expect(ids(projectsMatching(TAGGED, "alpha", by("comments")))).toEqual([]);
    expect(ids(projectsMatching(TAGGED, "alpha", by("archived")))).toEqual(["busy"]);
    expect(ids(foldersMatching(TAGGED, TOP, by("archived")))).toEqual(["alpha"]);
    expect(folderStats(TAGGED, TOP).map((entry) => entry.projects)).toEqual([1, 1]);
  });

  it("narrows any status to one label", () => {
    expect(ids(projectsMatching(TAGGED, "alpha", by("all", "Draft")))).toEqual(["ready"]);
    expect(ids(projectsMatching(TAGGED, "alpha", by("archived", "Draft")))).toEqual(["busy"]);
    expect(ids(foldersMatching(TAGGED, TOP, by("all", "Final")))).toEqual(["gamma"]);
    expect(ids(foldersMatching(TAGGED, TOP, by("resolved", "Draft")))).toEqual([]);
  });
});
