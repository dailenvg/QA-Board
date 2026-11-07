import { afterEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { connectedWorkspace, type Intercept } from "@/test/workspace-client";
import type { Database } from "../db/database";
import type { SquiggyEvent } from "../squiggy/events";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let intercept: Intercept | null = null;

afterEach(() => {
  intercept = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A connected workspace with folder f1, and every Squiggy event seen. */
async function setup() {
  const workspace = await connectedWorkspace(holder, { intercept: () => intercept });
  const { onSquiggy } = await import("../squiggy/events");
  const events: SquiggyEvent[] = [];
  onSquiggy(({ event }) => events.push(event));
  return { ...workspace, events, folderId: "f1" };
}

describe("Squiggy events from the actions", () => {
  it("tells of a created project, a resolve and each delete, and nothing for their undos", async () => {
    const { actions, events, folderId } = await setup();
    const created = actions.createProject({
      folderId,
      name: "Site",
      source: { kind: "url", url: "https://example.com/" },
    });
    if (!created.ok) throw new Error(created.error);
    const comment = await actions.addComment({
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

  it("tells of a refused write, and of a picture that couldn't be uploaded", async () => {
    const { actions, events, folderId, store } = await setup();
    const created = actions.createProject({
      folderId,
      name: "Site",
      source: { kind: "url", url: "https://example.com/" },
    });
    if (!created.ok) throw new Error(created.error);
    await store.whenSaved();
    // The server refuses every write from here on.
    intercept = (request) =>
      request.method === "GET" ? null : Promise.resolve(new Response(null, { status: 500 }));
    const image = { blob: new Blob(["x"]), fileName: "a.png", width: 1, height: 1 };
    const stored = await actions.replaceWithImage(created.value.id, image, {
      referenceUrl: undefined,
      pageId: null,
    });
    expect(stored.ok).toBe(false);
    // Shown at once, then rolled back when the server refuses it.
    expect(actions.renameFolder(folderId, "Renamed").ok).toBe(true);
    await store.whenSaved();
    expect(events).toEqual([
      { type: "project-created", projectName: "Site" },
      { type: "save-failed" },
      { type: "save-failed" },
    ]);
  });
});
