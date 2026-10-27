import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SquiggyEvent } from "../squiggy/events";

vi.mock("../blob-store/blob-store", () => ({
  putBlob: () => Promise.resolve(false),
  deleteBlobs: () => Promise.resolve(),
  holdBlob: () => {},
  listBlobs: () => Promise.resolve([]),
}));
const sweep = vi.hoisted(() => vi.fn());
vi.mock("./blob-sweep", () => ({ scheduleBlobSweep: sweep }));

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

describe("deleting expired projects", () => {
  const DAY = 86_400_000;
  /** 2026-09-01T00:00:00Z, in epoch ms. */
  const T0 = Date.UTC(2026, 8, 1);
  const share = { id: "s1", token: "t", ownerKey: "k", createdAt: T0, cursor: 0 };

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A workspace with "old" (shared, with a comment) made at T0, and "new" 10 days later. */
  async function workspace(retentionStart: number | null) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    if (retentionStart !== null) {
      localStorage.setItem("squint:retention-start", String(retentionStart));
    }
    const { actions, events, folderId } = await setup();
    const source = { kind: "url" as const, url: "https://example.com/" };
    const old = actions.createProject({ folderId, name: "Old", source });
    if (!old.ok) throw new Error(old.error);
    actions.shareProject(old.value.id, share);
    actions.addComment({ projectId: old.value.id, x: 1, y: 1, body: "Fix", author: "A" });
    vi.setSystemTime(T0 + 10 * DAY);
    const fresh = actions.createProject({ folderId, name: "New", source });
    if (!fresh.ok) throw new Error(fresh.error);
    const { getSnapshot } = await import("./store");
    const data = () => {
      const state = getSnapshot();
      if (state.status !== "ready") throw new Error("not ready");
      return state.data;
    };
    sweep.mockClear();
    events.length = 0;
    return { actions, events, data };
  }

  it("deletes them like a manual delete, without the Undo, and nothing younger", async () => {
    const { actions, events, data } = await workspace(T0);

    expect(actions.deleteExpiredProjects(T0 + 30 * DAY - 1)).toEqual([]);
    const deleted = actions.deleteExpiredProjects(T0 + 30 * DAY);

    expect(deleted.map((project) => project.name)).toEqual(["Old"]);
    expect(data().projects.map((project) => project.name)).toEqual(["New"]);
    expect(data().comments).toEqual([]);
    // Its link isn't revoked: the server deletes the share on the date its reviewers were shown.
    expect(data().revocations).toEqual([]);
    expect(sweep).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
  });

  it("gives projects already old when retention starts 5 days' notice first", async () => {
    const { actions, data } = await workspace(null);
    const firstLoad = T0 + 60 * DAY;

    expect(actions.deleteExpiredProjects(firstLoad)).toEqual([]);
    expect(actions.deleteExpiredProjects(firstLoad + 5 * DAY - 1)).toEqual([]);
    expect(actions.deleteExpiredProjects(firstLoad + 5 * DAY)).toHaveLength(2);
    expect(data().projects).toEqual([]);
  });
});
