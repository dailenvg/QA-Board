import { describe, expect, it } from "vitest";
import type { Comment, Folder, Project, SquintData } from "@/lib/store/types";
import { folderFiles, foldersWithStatus, projectsWithStatus } from "./folder-files";
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
const ids = (items: ReadonlyArray<{ id: string }>) => items.map((item) => item.id);

describe("folders by status", () => {
  it("counts a folder's projects with a status, subfolders included", () => {
    expect(ids(projectsWithStatus(DATA, "alpha"))).toEqual(["ready", "busy"]);
    expect(ids(projectsWithStatus(DATA, "alpha", "comments"))).toEqual(["busy"]);
    expect(ids(projectsWithStatus(DATA, "alpha", "resolved"))).toEqual([]);
    expect(ids(folderFiles(DATA, "alpha", "ready"))).toEqual(["ready"]);
  });

  it("keeps the folders that hold a project with the status; all of them for All", () => {
    expect(ids(foldersWithStatus(DATA, TOP, "all"))).toEqual(["alpha", "gamma"]);
    expect(ids(foldersWithStatus(DATA, TOP, "comments"))).toEqual(["alpha"]);
    expect(ids(foldersWithStatus(DATA, TOP, "resolved"))).toEqual(["gamma"]);
    expect(ids(foldersWithStatus(DATA, [folder("empty")], "ready"))).toEqual([]);
  });

  it("sorts filtered folders by their matching projects only", () => {
    expect(folderStats(DATA, TOP, "comments").map((entry) => entry.projects)).toEqual([1, 0]);
    expect(folderStats(DATA, TOP, "comments")[0]).toMatchObject({
      updatedAt: 2,
      openComments: true,
    });
    expect(folderStats(DATA, TOP).map((entry) => entry.projects)).toEqual([2, 1]);
  });
});
