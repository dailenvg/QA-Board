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
    actions.restoreProject(created.value, [], [], []);
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

describe("replies through the actions (4.1, D25)", () => {
  /** A connected workspace with project p1 and comment c1, both the owner's, saved. */
  async function threadSetup() {
    const workspace = await setup();
    const created = workspace.actions.createProject({
      folderId: workspace.folderId,
      name: "Site",
      source: { kind: "url", url: "https://example.com/" },
    });
    if (!created.ok) throw new Error(created.error);
    const comment = await workspace.actions.addComment({
      projectId: created.value.id,
      x: 1,
      y: 1,
      body: "Fix",
      author: "A",
    });
    if (!comment.ok) throw new Error(comment.error);
    const reply = (body: string) =>
      workspace.actions.addReply({
        projectId: created.value.id,
        commentId: comment.value.id,
        body,
        author: "A",
      });
    /** The replies the server has, by id and words, after reading the workspace again. */
    const serverReplies = async () => {
      await workspace.store.whenSaved();
      await workspace.store.refreshWorkspace();
      return workspace.data().replies.map((entry) => [entry.id, entry.body, entry.mine]);
    };
    return { ...workspace, project: created.value, comment: comment.value, reply, serverReplies };
  }

  /** A reply by another member of the workspace, straight into the database. */
  async function othersReply(db: Database, projectId: string, commentId: string) {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role, name) VALUES ('ben@acme.test', 'x', 'company', 'Ben') RETURNING id",
    );
    await db.query(
      `INSERT INTO comment_replies (project_id, comment_id, id, body, author_name, author_user_id, origin)
       VALUES ($1, $2, 'bens', 'Mine', 'Ben', $3, 'team')`,
      [projectId, commentId, rows[0]?.id],
    );
  }

  it("posts a reply that's the member's own, and leaves the comment as it was", async () => {
    const { reply, serverReplies, data, comment } = await threadSetup();
    const posted = await reply("On it");
    expect(posted.ok && posted.value).toMatchObject({ body: "On it", mine: true });
    if (!posted.ok) return;
    expect(await serverReplies()).toEqual([[posted.value.id, "On it", true]]);
    expect(data().comments.find((entry) => entry.id === comment.id)).toMatchObject({
      status: "active",
    });
  });

  it("brings one's own deleted reply back with Undo, still edited", async () => {
    const { actions, reply, serverReplies, data, events } = await threadSetup();
    const posted = await reply("On it");
    if (!posted.ok) throw new Error(posted.error);
    actions.editReply(posted.value.id, "Done");
    await serverReplies();
    const before = data().replies[0];
    if (!before?.editedAt) throw new Error("not edited");
    expect(actions.deleteReply(before.id).ok).toBe(true);
    expect(await serverReplies()).toEqual([]);
    expect(actions.restoreReply(before).ok).toBe(true);
    expect(await serverReplies()).toEqual([[before.id, "Done", true]]);
    expect(data().replies[0]?.editedAt).toBe(before.editedAt);
    expect(events).toContainEqual({ type: "item-deleted", item: "reply" });
  });

  it("brings a comment back with its replies when they're all the member's own", async () => {
    const { actions, reply, serverReplies, data, comment } = await threadSetup();
    for (const body of ["First", "Second"]) {
      const posted = await reply(body);
      if (!posted.ok) throw new Error(posted.error);
    }
    await serverReplies();
    const { commentDeleteMode, repliesFor } = await import("./replies");
    const replies = repliesFor(data(), comment);
    expect(commentDeleteMode(replies)).toBe("undo");
    actions.deleteComment(comment.id);
    expect(data().replies).toEqual([]);
    expect(await serverReplies()).toEqual([]);
    actions.restoreComment(comment, replies);
    expect((await serverReplies()).map(([, body]) => body)).toEqual(["First", "Second"]);
    expect(data().comments.map((entry) => entry.id)).toContain(comment.id);
  });

  it("deletes a comment others replied to for good, after asking, with every reply", async () => {
    const { actions, db, reply, serverReplies, data, comment, project } = await threadSetup();
    await reply("Mine");
    await othersReply(db, project.id, comment.id);
    await serverReplies();
    const { commentDeleteMode, repliesFor } = await import("./replies");
    expect(commentDeleteMode(repliesFor(data(), comment))).toBe("confirm");
    expect(await actions.deleteOthersComment(comment)).toBe("deleted");
    expect(data().replies).toEqual([]);
    expect(await serverReplies()).toEqual([]);
    expect(data().comments).toEqual([]);
  });

  it("lets the owner delete another member's reply for good, waiting for the server", async () => {
    const { actions, db, serverReplies, data, comment, project, events } = await threadSetup();
    await othersReply(db, project.id, comment.id);
    expect(await serverReplies()).toEqual([["bens", "Mine", undefined]]);
    const bens = data().replies[0];
    if (!bens) throw new Error("no reply");
    const { replyDeleteMode } = await import("./replies");
    expect(replyDeleteMode(bens)).toBe("confirm");
    expect(await actions.deleteOthersReply(bens)).toBe("deleted");
    expect(data().replies).toEqual([]);
    expect(await serverReplies()).toEqual([]);
    expect(await actions.deleteOthersReply(bens)).toBe("gone");
    expect(events.filter((event) => event.type === "item-deleted")).toEqual([
      { type: "item-deleted", item: "reply" },
    ]);
  });
});
