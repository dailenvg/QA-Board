import { describe, expect, it } from "vitest";
import { reduce, type Action } from "../store/reducer";
import type { Comment, Project, SquintData } from "../store/types";
import { refusalMessage, SAVE_FAILED, writesFor } from "./mutations";

const project = (id: string, folderId: string): Project => ({
  id,
  folderId,
  name: id,
  source: { kind: "url", url: "https://acme.example/" },
  createdAt: 1,
  updatedAt: 1,
});

const comment: Comment = {
  id: "c1",
  projectId: "p1",
  x: 10,
  y: 20,
  body: "Fix",
  author: "Ana",
  status: "active",
  createdAt: 5,
  updatedAt: 5,
};

const DATA: SquintData = {
  version: 3,
  folders: [
    { id: "f1", name: "Work", createdAt: 0, parentId: null },
    { id: "f2", name: "Inner", createdAt: 1, parentId: "f1" },
    { id: "f3", name: "Other", createdAt: 2, parentId: null },
  ],
  projects: [
    project("p1", "f1"),
    project("p2", "f2"),
    {
      ...project("p3", "f3"),
      share: { id: "s1", token: "t", ownerKey: "k", createdAt: 1, cursor: 2 },
    },
  ],
  comments: [comment],
  snapshots: [],
  revocations: [],
  authorName: null,
};

const writes = (action: Action) => writesFor(action, DATA, reduce(DATA, action));

describe("writesFor", () => {
  it("trashes every project in a folder's subtree before deleting the folder", () => {
    expect(writes({ type: "folder/delete", id: "f1", at: 9 })).toEqual([
      { method: "DELETE", path: "/projects/p1", body: {}, tolerate: [404] },
      { method: "DELETE", path: "/projects/p2", body: {}, tolerate: [404] },
      { method: "DELETE", path: "/folders/f1", body: {}, tolerate: [404] },
    ]);
  });

  it("finds a comment's project for its edits, and sends nothing for one it doesn't know", () => {
    expect(writes({ type: "comment/edit", id: "c1", body: "Done", at: 9 })).toEqual([
      { method: "PATCH", path: "/projects/p1/comments/c1", body: { body: "Done" } },
    ]);
    expect(writes({ type: "comment/edit", id: "nope", body: "Done", at: 9 })).toEqual([]);
  });

  it("sends a comment without its project id, and accepts a re-added one as done", () => {
    const [write] = writes({ type: "comment/restore", comment: { ...comment, id: "c2" } });
    expect(write).toEqual({
      method: "POST",
      path: "/projects/p1/comments",
      body: { ...comment, id: "c2", projectId: undefined },
      tolerate: [409],
    });
    expect(write?.body).not.toHaveProperty("projectId");
  });

  it("saves a pull's snapshots before its comments, then the new pull position", () => {
    const snapshot = {
      id: "snap",
      projectId: "p3",
      width: 800,
      height: 600,
      createdAt: 7,
      blobKey: "snapshot:snap",
      sourceUrl: "https://acme.example/",
    };
    const pulled = { ...comment, id: "guest", projectId: "p3", snapshotId: "snap" };
    const result = writes({
      type: "share/merge",
      id: "p3",
      comments: [pulled],
      snapshots: [snapshot],
      cursor: 5,
      at: 11,
    });
    expect(result.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /projects/p3/snapshots",
      "POST /projects/p3/comments",
      "PATCH /projects/p3/share-link",
    ]);
    expect(result[2]?.body).toEqual({ cursor: 5, lastSyncedAt: 11 });
  });

  it("attaches a new link with its secrets, and revoking one already gone counts as done", () => {
    const share = { id: "s9", token: "tok", ownerKey: "key", createdAt: 3, cursor: 0 };
    expect(writes({ type: "project/share", id: "p1", share })).toEqual([
      {
        method: "PUT",
        path: "/projects/p1/share-link",
        body: { shareId: "s9", token: "tok", ownerKey: "key" },
      },
    ]);
    expect(writes({ type: "project/unshare", id: "p3" })).toEqual([
      { method: "DELETE", path: "/projects/p3/share-link", body: {}, tolerate: [404] },
    ]);
  });

  it("sends nothing for browser-only bookkeeping", () => {
    expect(writes({ type: "revocation/done", shareId: "s1" })).toEqual([]);
    expect(writes({ type: "revocation/due", projectId: "p3", at: 1 })).toEqual([]);
  });
});

describe("refusalMessage", () => {
  it("says a thing was deleted elsewhere for a 404, and asks to retry otherwise", () => {
    const rename: Action = { type: "project/rename", id: "p1", name: "X", at: 2 };
    expect(refusalMessage(rename, 404)).toMatch(/deleted in another tab/);
    expect(refusalMessage({ type: "folder/rename", id: "f1", name: "X" }, 404)).toMatch(
      /This folder is no longer here/,
    );
    expect(refusalMessage(rename, 0)).toBe(SAVE_FAILED);
    expect(refusalMessage(rename, 500)).toBe(SAVE_FAILED);
  });
});
