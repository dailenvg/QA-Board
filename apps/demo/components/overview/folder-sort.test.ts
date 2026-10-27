import { describe, expect, it } from "vitest";
import type { Comment, Folder, Project, SquintData } from "@/lib/store/types";
import { parseSortChoice } from "../dashboard/sort-choice";
import { FOLDER_SORT, folderStats, sortFolders, type FolderStats } from "./folder-sort";

function folder(id: string, createdAt = 0, parentId: string | null = null): Folder {
  return { id, name: id, createdAt, parentId };
}

function project(id: string, folderId: string, updatedAt: number): Project {
  return {
    id,
    folderId,
    name: id,
    source: { kind: "url", url: "https://example.com/" },
    createdAt: 0,
    updatedAt,
  };
}

function comment(id: string, projectId: string, status: Comment["status"]): Comment {
  return { id, projectId, x: 0, y: 0, body: "", author: "Ana", status, createdAt: 0, updatedAt: 0 };
}

function data(parts: Partial<SquintData>): SquintData {
  return {
    version: 3,
    folders: [],
    projects: [],
    comments: [],
    snapshots: [],
    revocations: [],
    authorName: null,
    ...parts,
  };
}

function stats(
  name: string,
  { updatedAt = 0, projects = 0, openComments = false } = {},
): FolderStats {
  return { folder: { ...folder(name), name }, updatedAt, projects, openComments };
}

const names = (folders: readonly Folder[]) => folders.map((entry) => entry.name);

describe("folderStats", () => {
  const folders = [folder("a", 5), folder("b", 7), folder("b-inner", 8, "b"), folder("empty", 9)];
  const workspace = data({
    folders,
    projects: [project("p1", "a", 20), project("p2", "b", 10), project("p3", "b-inner", 30)],
    comments: [comment("c1", "p1", "resolved"), comment("c2", "p3", "active")],
  });
  const top = folders.filter((entry) => entry.parentId === null);
  const byId = new Map(folderStats(workspace, top).map((entry) => [entry.folder.id, entry]));

  it("takes the newest project activity inside, subfolders included", () => {
    expect(byId.get("a")?.updatedAt).toBe(20);
    expect(byId.get("b")?.updatedAt).toBe(30);
  });

  it("falls back to when the folder was made when it holds no projects", () => {
    expect(byId.get("empty")?.updatedAt).toBe(9);
  });

  it("counts projects in subfolders too", () => {
    expect(byId.get("b")?.projects).toBe(2);
    expect(byId.get("empty")?.projects).toBe(0);
  });

  it("flags open comments anywhere inside, not resolved ones", () => {
    expect(byId.get("a")?.openComments).toBe(false);
    expect(byId.get("b")?.openComments).toBe(true);
  });

  it("keeps the folders' order", () => {
    expect(folderStats(workspace, top).map((entry) => entry.folder.id)).toEqual([
      "a",
      "b",
      "empty",
    ]);
  });
});

describe("sortFolders by last updated", () => {
  const list = [
    stats("Old", { updatedAt: 1 }),
    stats("New", { updatedAt: 3 }),
    stats("Mid", { updatedAt: 2 }),
  ];

  it("puts the most recently updated first by default", () => {
    expect(FOLDER_SORT.fallback).toEqual({ key: "updated", direction: "desc" });
    expect(names(sortFolders(list, "updated", "desc"))).toEqual(["New", "Mid", "Old"]);
  });

  it("puts the oldest first when reversed, ties by name both ways", () => {
    expect(names(sortFolders(list, "updated", "asc"))).toEqual(["Old", "Mid", "New"]);
    const tied = [stats("Beta", { updatedAt: 5 }), stats("Alpha", { updatedAt: 5 })];
    expect(names(sortFolders(tied, "updated", "desc"))).toEqual(["Alpha", "Beta"]);
    expect(names(sortFolders(tied, "updated", "asc"))).toEqual(["Alpha", "Beta"]);
  });
});

describe("sortFolders by name", () => {
  it("ignores case and accents and orders numbers by value", () => {
    const list = [stats("client 10"), stats("Client 2"), stats("Éclair"), stats("apple")];
    expect(names(sortFolders(list, "name", "asc"))).toEqual([
      "apple",
      "Client 2",
      "client 10",
      "Éclair",
    ]);
    expect(names(sortFolders(list, "name", "desc"))).toEqual([
      "Éclair",
      "client 10",
      "Client 2",
      "apple",
    ]);
  });
});

describe("sortFolders by project count", () => {
  const list = [
    stats("Few", { projects: 1 }),
    stats("Many", { projects: 9 }),
    stats("Beta", { projects: 4 }),
    stats("Alpha", { projects: 4 }),
  ];

  it("puts the fullest first, ties by name", () => {
    expect(names(sortFolders(list, "projects", "desc"))).toEqual(["Many", "Alpha", "Beta", "Few"]);
  });

  it("puts the emptiest first when reversed, ties still by name", () => {
    expect(names(sortFolders(list, "projects", "asc"))).toEqual(["Few", "Alpha", "Beta", "Many"]);
  });
});

describe("sortFolders by open comments", () => {
  const list = [
    stats("Quiet new", { updatedAt: 9 }),
    stats("Open old", { updatedAt: 1, openComments: true }),
    stats("Quiet old", { updatedAt: 2 }),
    stats("Open new", { updatedAt: 5, openComments: true }),
  ];

  it("puts folders with open comments first, each group newest first", () => {
    expect(names(sortFolders(list, "comments", "asc"))).toEqual([
      "Open new",
      "Open old",
      "Quiet new",
      "Quiet old",
    ]);
  });

  it("puts them last when reversed, each group still newest first", () => {
    expect(names(sortFolders(list, "comments", "desc"))).toEqual([
      "Quiet new",
      "Quiet old",
      "Open new",
      "Open old",
    ]);
  });
});

describe("sortFolders", () => {
  it("returns a copy and leaves its input alone", () => {
    const list = [stats("B"), stats("A")];
    expect(names(sortFolders(list, "name", "asc"))).toEqual(["A", "B"]);
    expect(list.map((entry) => entry.folder.name)).toEqual(["B", "A"]);
  });

  it("handles no folders", () => {
    expect(sortFolders([], "comments", "asc")).toEqual([]);
  });
});

describe("a stored folder sort", () => {
  it("reads a stored choice and falls back to newest first for anything else", () => {
    expect(
      parseSortChoice(JSON.stringify({ key: "projects", direction: "asc" }), FOLDER_SORT),
    ).toEqual({ key: "projects", direction: "asc" });
    for (const raw of [null, "{", JSON.stringify({ key: "date", direction: "desc" })]) {
      expect(parseSortChoice(raw, FOLDER_SORT)).toEqual(FOLDER_SORT.fallback);
    }
  });
});
