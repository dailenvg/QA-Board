import { afterEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { connectedWorkspace, type Intercept } from "@/test/workspace-client";
import { PNG } from "@/test/workspace-fixture";
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

describe("a comment the member posts", () => {
  /** Gives the workspace's owner a photo, as their profile stores one. */
  async function ownerPhoto(db: Database, workspaceId: string) {
    const { rows } = await db.query<{ user_id: string }>(
      "SELECT user_id FROM memberships WHERE workspace_id = $1 AND role = 'owner'",
      [workspaceId],
    );
    const userId = rows[0]?.user_id ?? "";
    const key = `user/${userId}/avatar/a1`;
    await db.query(
      `INSERT INTO user_blobs (user_id, key, content_type, size, bytes)
       VALUES ($1, $2, 'image/png', $3, $4)`,
      [userId, key, PNG.length, PNG],
    );
    await db.query("UPDATE users SET avatar_blob_key = $2 WHERE id = $1", [userId, key]);
  }

  const post = async (actions: Awaited<ReturnType<typeof setup>>["actions"], projectId: string) => {
    const comment = await actions.addComment({ projectId, x: 1, y: 1, body: "Fix", author: "A" });
    if (!comment.ok) throw new Error(comment.error);
    return comment.value;
  };

  const site = { name: "Site", source: { kind: "url", url: "https://example.com/" } } as const;

  it("carries their photo at once, as the server gives it on their comments", async () => {
    const workspace = await connectedWorkspace(holder, { setUp: ownerPhoto });
    const created = workspace.actions.createProject({ folderId: "f1", ...site });
    if (!created.ok) throw new Error(created.error);
    const own = workspace.start.data.workspace.avatarSrc;
    expect(own).toMatch(/^\/api\/w\/[^/]+\/people\/[A-Za-z0-9_-]{22}\/avatar\?v=[0-9a-f]{16}$/);
    const comment = await post(workspace.actions, created.value.id);
    expect(comment.authorAvatar).toBe(own);
    expect(workspace.data().comments.find((entry) => entry.id === comment.id)).toMatchObject({
      authorAvatar: own,
      mine: true,
    });
    // The server's own read agrees.
    await workspace.store.refreshWorkspace();
    expect(workspace.data().comments.find((entry) => entry.id === comment.id)?.authorAvatar).toBe(
      own,
    );
  });

  it("carries none without a photo: initials", async () => {
    const workspace = await connectedWorkspace(holder);
    const created = workspace.actions.createProject({ folderId: "f1", ...site });
    if (!created.ok) throw new Error(created.error);
    expect(workspace.start.data.workspace.avatarSrc).toBeNull();
    expect(await post(workspace.actions, created.value.id)).not.toHaveProperty("authorAvatar");
  });
});
