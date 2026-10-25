import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  childFolders,
  flattenFolderTree,
  folderContents,
  folderMoveProblem,
  subtreeIds,
} from "./folders";
import { reduce, REVOKE_GRACE_MS } from "./reducer";
import type { Comment, Folder, Project, SquintData } from "./types";

const folder = (id: string, parentId: string | null, createdAt: number): Folder => ({
  id,
  name: id.toUpperCase(),
  createdAt,
  parentId,
});

/** top: a > b > c, and d beside a; e, older, at the top level too. */
const FOLDERS: Folder[] = [
  folder("a", null, 2),
  folder("b", "a", 3),
  folder("c", "b", 4),
  folder("d", null, 5),
  folder("e", null, 1),
];

const project = (id: string, folderId: string, shared = false): Project => ({
  id,
  folderId,
  name: id,
  source: { kind: "url", url: "https://example.com/" },
  createdAt: 1,
  updatedAt: 1,
  ...(shared
    ? { share: { id: `s-${id}`, token: "t", ownerKey: "k", createdAt: 1, cursor: 0 } }
    : {}),
});

const comment = (id: string, projectId: string): Comment => ({
  id,
  projectId,
  x: 1,
  y: 1,
  body: "Hi",
  author: "Ana",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
});

const DATA: SquintData = {
  version: 3,
  folders: FOLDERS,
  projects: [
    project("p-a", "a"),
    project("p-b", "b", true),
    project("p-c", "c", true),
    project("p-d", "d"),
  ],
  comments: [comment("1", "p-b"), comment("2", "p-c"), comment("3", "p-c"), comment("4", "p-d")],
  snapshots: [],
  revocations: [],
  authorName: null,
};

describe("folder tree", () => {
  it("lists children oldest first, and flattens depth first", () => {
    expect(childFolders(FOLDERS, null).map((entry) => entry.id)).toEqual(["e", "a", "d"]);
    expect(
      flattenFolderTree(FOLDERS).map(({ folder: entry, depth, hasChildren }) => [
        entry.id,
        depth,
        hasChildren,
      ]),
    ).toEqual([
      ["e", 0, false],
      ["a", 0, true],
      ["b", 1, true],
      ["c", 2, false],
      ["d", 0, false],
    ]);
    const closed = flattenFolderTree(FOLDERS, (id) => id !== "b");
    expect(closed.map((row) => row.folder.id)).toEqual(["e", "a", "b", "d"]);
  });

  it("finds ancestors top down, and every folder inside one", () => {
    expect(ancestorsOf(FOLDERS, "c").map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(ancestorsOf(FOLDERS, "a")).toEqual([]);
    expect([...subtreeIds(FOLDERS, "a")].sort()).toEqual(["a", "b", "c"]);
  });

  it("refuses moves into the folder itself or anything inside it", () => {
    expect(folderMoveProblem(FOLDERS, "a", "a")).toBe("self");
    expect(folderMoveProblem(FOLDERS, "a", "c")).toBe("descendant");
    expect(folderMoveProblem(FOLDERS, "b", "a")).toBe("same-parent");
    expect(folderMoveProblem(FOLDERS, "b", "d")).toBeNull();
    expect(folderMoveProblem(FOLDERS, "c", null)).toBeNull();
    expect(folderMoveProblem(FOLDERS, "c", "gone")).toBe("missing-target");
    expect(folderMoveProblem(FOLDERS, "gone", null)).toBe("missing");
  });

  it("counts what a folder holds at any depth", () => {
    expect(folderContents(DATA, "a")).toEqual({
      subfolders: 2,
      projects: 3,
      comments: 3,
      shared: 2,
    });
    expect(folderContents(DATA, "d")).toEqual({
      subfolders: 0,
      projects: 1,
      comments: 1,
      shared: 0,
    });
  });
});

describe("folders in the reducer", () => {
  it("moves a folder, or to the top level, and never into itself or its subfolders", () => {
    const moved = reduce(DATA, { type: "folder/move", id: "b", parentId: "d" });
    expect(moved.folders.find((entry) => entry.id === "b")?.parentId).toBe("d");
    const top = reduce(DATA, { type: "folder/move", id: "c", parentId: null });
    expect(top.folders.find((entry) => entry.id === "c")?.parentId).toBeNull();
    expect(reduce(DATA, { type: "folder/move", id: "a", parentId: "c" })).toBe(DATA);
    expect(reduce(DATA, { type: "folder/move", id: "a", parentId: "a" })).toBe(DATA);
  });

  it("deletes a folder with everything inside it, revoking shared links at once", () => {
    const deleted = reduce(DATA, { type: "folder/delete", id: "a", at: 7 });
    expect(deleted.folders.map((entry) => entry.id).sort()).toEqual(["d", "e"]);
    expect(deleted.projects.map((entry) => entry.id)).toEqual(["p-d"]);
    expect(deleted.comments.map((entry) => entry.id)).toEqual(["4"]);
    expect(deleted.revocations).toEqual([
      { shareId: "s-p-b", ownerKey: "k", projectId: "p-b", dueAt: 7 },
      { shareId: "s-p-c", ownerKey: "k", projectId: "p-c", dueAt: 7 },
    ]);
    // Due now, not after the grace a project delete's Undo gets.
    expect(deleted.revocations[0]?.dueAt).toBeLessThan(7 + REVOKE_GRACE_MS);
  });

  it("never deletes the last folders", () => {
    const only: SquintData = { ...DATA, folders: [folder("a", null, 1), folder("b", "a", 2)] };
    expect(reduce(only, { type: "folder/delete", id: "a", at: 1 })).toBe(only);
    expect(reduce(only, { type: "folder/delete", id: "b", at: 1 }).folders).toHaveLength(1);
  });
});
