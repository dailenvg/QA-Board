import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SquiggyEvent } from "../squiggy/events";

vi.mock("../blob-store/blob-store", () => ({
  putBlob: () => Promise.resolve(false),
  deleteBlobs: () => Promise.resolve(),
  holdBlob: () => {},
  listBlobs: () => Promise.resolve([]),
}));
vi.mock("./blob-sweep", () => ({ scheduleBlobSweep: () => {} }));

let full = false;

function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => {
      if (full) throw new DOMException("Full", "QuotaExceededError");
      items.set(key, String(value));
    },
  };
}

/** Fresh store, actions and event modules (their state is module-level), with every event seen. */
async function setup() {
  vi.resetModules();
  const actions = await import("./actions");
  const { onSquiggy } = await import("../squiggy/events");
  const events: SquiggyEvent[] = [];
  onSquiggy(({ event }) => events.push(event));
  const folder = actions.createFolder("Work");
  if (!folder.ok) throw new Error(folder.error);
  return { actions, events, folderId: folder.value.id };
}

beforeEach(() => {
  full = false;
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Squiggy events from the actions", () => {
  it("tells of a created project, a resolve and each delete, and nothing for their undos", async () => {
    const { actions, events, folderId } = await setup();
    const created = actions.createProject({
      folderId,
      name: "Site",
      source: { kind: "url", url: "https://example.com/" },
    });
    if (!created.ok) throw new Error(created.error);
    const comment = actions.addComment({
      projectId: created.value.id,
      x: 1,
      y: 1,
      body: "Fix",
      author: "A",
    });
    if (!comment.ok) throw new Error(comment.error);
    actions.setCommentStatus(comment.value.id, "resolved");
    actions.setCommentStatus(comment.value.id, "resolved");
    actions.setCommentStatus(comment.value.id, "active");
    actions.deleteComment(comment.value.id);
    actions.restoreComment(comment.value);
    actions.deleteProject(created.value.id);
    actions.restoreProject(created.value, [], []);
    const old = actions.createFolder("Old");
    if (!old.ok) throw new Error(old.error);
    actions.deleteFolder(old.value.id);
    expect(events).toEqual([
      { type: "project-created", projectName: "Site" },
      { type: "comment-resolved" },
      { type: "item-deleted", item: "comment" },
      { type: "item-deleted", item: "project" },
      { type: "item-deleted", item: "folder" },
    ]);
  });

  it("tells of a refused write, and of a picture that couldn't be stored", async () => {
    const { actions, events, folderId } = await setup();
    const created = actions.createProject({
      folderId,
      name: "Site",
      source: { kind: "url", url: "https://example.com/" },
    });
    if (!created.ok) throw new Error(created.error);
    // The blob store refuses every picture (see the mock above).
    const image = { blob: new Blob(["x"]), fileName: "a.png", width: 1, height: 1 };
    const stored = await actions.replaceWithImage(created.value.id, image, {
      referenceUrl: undefined,
      pageId: null,
    });
    expect(stored.ok).toBe(false);
    full = true;
    expect(actions.renameFolder(folderId, "Renamed").ok).toBe(false);
    expect(events).toEqual([
      { type: "project-created", projectName: "Site" },
      { type: "save-failed" },
      { type: "save-failed" },
    ]);
  });
});
