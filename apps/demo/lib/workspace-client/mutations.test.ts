import { describe, expect, it } from "vitest";
import { reduce, type Action } from "../store/reducer";
import type { Comment, Project, SquintData } from "../store/types";
import { passwordRefusal, refusalMessage, SAVE_FAILED, writesFor } from "./mutations";

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
      share: {
        id: "s1",
        token: "t",
        ownerKey: "k",
        createdAt: 1,
        cursor: 2,
        reviewWindowHours: 72,
        reviewEndsAt: 1 + 72 * 3_600_000,
      },
    },
  ],
  comments: [comment],
  snapshots: [],
  authorName: null,
};

const writes = (action: Action) => writesFor(action, DATA, reduce(DATA, action));

const CONTEXT = { ownerName: "Dailen", workspaceName: "Acme" };

describe("writesFor", () => {
  it("trashes every project in a folder's subtree before deleting the folder", () => {
    expect(writes({ type: "folder/delete", id: "f1", at: 9 })).toEqual([
      { method: "DELETE", path: "/projects/p1", body: {}, tolerate: [404] },
      { method: "DELETE", path: "/projects/p2", body: {}, tolerate: [404] },
      { method: "DELETE", path: "/folders/f1", body: {}, tolerate: [404] },
    ]);
  });

  it("takes back a page project whose upload failed with abandon, never the trash", () => {
    const action: Action = { type: "project/abandon", id: "p1" };
    expect(writes(action)).toEqual([{ method: "POST", path: "/projects/p1/abandon", body: {} }]);
    expect(reduce(DATA, action).projects.map((entry) => entry.id)).not.toContain("p1");
    expect(reduce(DATA, action).comments.filter((entry) => entry.projectId === "p1")).toEqual([]);
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

  it("restores a client's comment only as a client's: never re-posted as the member's", () => {
    const restored = writes({ type: "comment/restore", comment: { ...comment, fromClient: true } });
    const body = { ...comment, projectId: undefined };
    // A 404 (the review link no longer has it) refuses the Undo.
    expect(restored).toEqual([
      {
        method: "POST",
        path: "/projects/p1/comments",
        body: { ...body, fromShare: true },
        tolerate: [409],
      },
    ]);
    expect(restored[0]?.body).not.toHaveProperty("fromClient");
    const action: Action = { type: "comment/restore", comment: { ...comment, fromClient: true } };
    expect(refusalMessage(action, 404, null, CONTEXT)).toBe(
      "Couldn't bring the comment back, because it's no longer on the review link.",
    );
  });

  it("restores the member's own edited comment with when it was edited, and never says whose", () => {
    const own: Comment = { ...comment, id: "c2", editedAt: 7, mine: true };
    const [write] = writes({ type: "comment/restore", comment: own });
    expect(write?.body).toMatchObject({ id: "c2", editedAt: 7 });
    expect(write?.body).not.toHaveProperty("mine");
  });

  it("never sends whose a new comment is, nor the photo and team only the server says", () => {
    const stamped: Comment = {
      ...comment,
      id: "c3",
      mine: true,
      team: true,
      authorAvatar: "/api/w/w1/people/AAAAAAAAAAAAAAAAAAAAAA/avatar?v=1",
    };
    for (const action of [
      { type: "comment/add", comment: stamped },
      { type: "comment/restore", comment: stamped },
    ] satisfies Action[]) {
      const [write] = writes(action);
      for (const field of ["mine", "team", "authorAvatar"]) {
        expect(write?.body).not.toHaveProperty(field);
      }
    }
  });

  it("sends nothing to take out a comment the server already deleted", () => {
    expect(writes({ type: "comment/removed", id: "c1" })).toEqual([]);
    expect(reduce(DATA, { type: "comment/removed", id: "c1" }).comments).toEqual([]);
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

  it("copies a pulled client edit from the link, sending no words, and only for a comment still here", () => {
    const guest: Comment = { ...comment, id: "guest", projectId: "p3", fromClient: true };
    const before = { ...DATA, comments: [...DATA.comments, guest] };
    const edit = { id: "guest", body: "Planted?", editedAt: 9 };
    const merge = {
      type: "share/merge" as const,
      id: "p3",
      comments: [],
      snapshots: [],
      edits: [edit],
      cursor: 6,
      at: 12,
    };
    const result = writesFor(merge, before, reduce(before, merge));
    expect(result).toEqual([
      {
        method: "POST",
        path: "/projects/p3/comments/guest/client-edit",
        body: {},
        tolerate: [404],
      },
      { method: "PATCH", path: "/projects/p3/share-link", body: { cursor: 6, lastSyncedAt: 12 } },
    ]);
    // Deleted here before the edit arrived: nothing to copy it onto.
    expect(writesFor(merge, DATA, reduce(DATA, merge)).map((write) => write.path)).toEqual([
      "/projects/p3/share-link",
    ]);
  });

  it("attaches a new link with its secrets and window, and revoking one already gone counts as done", () => {
    const share = {
      id: "s9",
      token: "tok",
      ownerKey: "key",
      createdAt: 3,
      cursor: 0,
      reviewWindowHours: 24,
      reviewEndsAt: 3 + 24 * 3_600_000,
    };
    expect(writes({ type: "project/share", id: "p1", share })).toEqual([
      {
        method: "PUT",
        path: "/projects/p1/share-link",
        body: { shareId: "s9", token: "tok", ownerKey: "key", reviewWindow: "24h" },
      },
    ]);
    expect(writes({ type: "project/unshare", id: "p3" })).toEqual([
      { method: "DELETE", path: "/projects/p3/share-link", body: {}, tolerate: [404] },
    ]);
  });
});

describe("review window writes", () => {
  it("sends the window by name to the link's settings, no limit as none", () => {
    expect(writes({ type: "share/window", id: "p3", hours: 168 })).toEqual([
      { method: "PATCH", path: "/projects/p3/share-link/settings", body: { reviewWindow: "7d" } },
    ]);
    expect(writes({ type: "share/window", id: "p3", hours: null })).toEqual([
      { method: "PATCH", path: "/projects/p3/share-link/settings", body: { reviewWindow: "none" } },
    ]);
  });

  it("sends nothing to put back a window the server already has", () => {
    expect(writes({ type: "share/window-restore", id: "p3", hours: 24 })).toEqual([]);
  });

  it("says the link is gone when the server no longer has it", () => {
    expect(
      refusalMessage({ type: "share/window", id: "p3", hours: 24 }, 404, null, CONTEXT),
    ).toMatch(/share link is no longer here/);
  });
});

describe("link password", () => {
  it("never sends anything for the store's copy: the password went to the server by itself", () => {
    expect(writes({ type: "share/password", id: "p3", passwordSetAt: 9 })).toEqual([]);
    expect(writes({ type: "share/password", id: "p3", passwordSetAt: null })).toEqual([]);
  });

  it("says why a change didn't happen", () => {
    expect(passwordRefusal(404, false, null, CONTEXT)).toMatch(/share link is no longer here/);
    expect(passwordRefusal(400, false, null, CONTEXT)).toBe("Use 8 to 128 characters.");
    expect(passwordRefusal(0, false, null, CONTEXT)).toMatch(/didn't save/);
    expect(passwordRefusal(500, true, null, CONTEXT)).toMatch(/wasn't removed/);
  });
});

describe("archive and label writes", () => {
  it("archives and unarchives through the archive route", () => {
    expect(writes({ type: "project/archive", id: "p1", archived: true, at: 9 })).toEqual([
      { method: "PUT", path: "/projects/p1/archive", body: { archived: true } },
    ]);
    expect(writes({ type: "project/archive", id: "p1", archived: false, at: 9 })).toEqual([
      { method: "PUT", path: "/projects/p1/archive", body: { archived: false } },
    ]);
  });

  it("sets and clears a label through the label route", () => {
    expect(writes({ type: "project/label", id: "p2", label: "Urgent" })).toEqual([
      { method: "PUT", path: "/projects/p2/label", body: { label: "Urgent" } },
    ]);
    expect(writes({ type: "project/label", id: "p2", label: null })).toEqual([
      { method: "PUT", path: "/projects/p2/label", body: { label: null } },
    ]);
  });
});

describe("refusalMessage", () => {
  it("says a thing was deleted elsewhere for a 404, and asks to retry otherwise", () => {
    const rename: Action = { type: "project/rename", id: "p1", name: "X", at: 2 };
    expect(refusalMessage(rename, 404, null, CONTEXT)).toMatch(/deleted in another tab/);
    expect(
      refusalMessage({ type: "folder/rename", id: "f1", name: "X" }, 404, null, CONTEXT),
    ).toMatch(/This folder is no longer here/);
    expect(refusalMessage(rename, 0, null, CONTEXT)).toBe(SAVE_FAILED);
    expect(refusalMessage(rename, 500, null, CONTEXT)).toBe(SAVE_FAILED);
  });
});

describe("refusals from a switch turned off since the page loaded", () => {
  const off = (permission: string) => ({ error: "not-allowed", permission });

  it("names the switch and who to ask, wherever the action was", () => {
    const trash: Action = { type: "project/delete", id: "p1", at: 2 };
    expect(refusalMessage(trash, 403, off("projects.trash"), CONTEXT)).toBe(
      "You can no longer move projects to trash or restore them. Ask Dailen if you need to.",
    );
    const window: Action = { type: "share/window", id: "p3", hours: 24 };
    expect(refusalMessage(window, 403, off("links.manage"), CONTEXT)).toBe(
      "You can no longer change this link. Ask Dailen if you need to.",
    );
    expect(passwordRefusal(403, false, off("links.manage"), CONTEXT)).toBe(
      "You can no longer change this link. Ask Dailen if you need to.",
    );
  });

  it("says why Undo can't bring a trashed project back, without asking anyone", () => {
    const restore: Action = {
      type: "project/restore",
      project: project("p9", "f1"),
      comments: [],
      snapshots: [],
    };
    expect(refusalMessage(restore, 403, off("projects.trash"), CONTEXT)).toBe(
      "Couldn't bring back p9, because you can no longer restore projects.",
    );
  });

  it("asks the workspace's owner when they have no name", () => {
    const trash: Action = { type: "project/delete", id: "p1", at: 2 };
    expect(
      refusalMessage(trash, 403, off("projects.trash"), { ownerName: null, workspaceName: "Acme" }),
    ).toMatch(/Ask the workspace's owner if you need to\.$/);
  });
});
