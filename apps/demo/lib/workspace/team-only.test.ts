import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { STATE } from "@/test/share-fixture";
import {
  addFolder,
  memberSeat,
  NOW,
  PNG,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import type { ShareServices } from "../share/server";
import { applyChanges, createShare, readBlob } from "../share/service";
import type { ShareChange, SharedComment, SharedReply } from "../share/types";
import type { Comment, Reply } from "../store/types";
import { createProject } from "./projects";
import { attachShare } from "./share-links";

/**
 * Team-only comments and replies (057, D8-D13, D41): who may change it, and
 * the three ways the server keeps them off the review link: the change's own
 * transaction, every push, and attaching a link.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let db: Database;
let owner: Seat;
let ben: Seat;
let cleo: Seat;
let services: ShareServices;
let shareId: string;

/** A comment as the owner's browser pushes it to the link. */
const shared = (id: string, extra: Partial<SharedComment> = {}): SharedComment => ({
  id,
  x: 1,
  y: 1,
  body: "Hi",
  author: "Dailen",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});
const sharedReply = (id: string, commentId: string): SharedReply => ({
  id,
  commentId,
  body: "Yes",
  author: "Dailen",
  createdAt: NOW,
});
const change = (extra: Partial<ShareChange>): ShareChange => ({
  snapshots: [],
  comments: [],
  replies: [],
  deleteSnapshots: [],
  deleteComments: [],
  deleteReplies: [],
  cursor: 0,
  ...extra,
});

const path = (rest = "") => `/api/w/${owner.workspaceId}/projects/p1/comments${rest}`;
const post = (who: Seat, id: string, extra: Record<string, unknown> = {}) =>
  call("POST", path(), {
    cookie: who.cookie,
    body: { id, x: 1, y: 1, body: "Hi", author: "Someone", ...extra },
  });
const patch = (who: Seat, id: string, body: unknown) =>
  call("PATCH", path(`/${id}`), { cookie: who.cookie, body });
const reply = (who: Seat, commentId: string, id: string, extra: Record<string, unknown> = {}) =>
  call("POST", path(`/${commentId}/replies`), {
    cookie: who.cookie,
    body: { id, body: "Yes", author: "Someone", ...extra },
  });
const patchReply = (who: Seat, commentId: string, id: string, body: unknown) =>
  call("PATCH", path(`/${commentId}/replies/${id}`), { cookie: who.cookie, body });

async function share() {
  const record = await services.store.byId(shareId);
  if (!record) throw new Error("no share");
  return record;
}

/** What the link holds: its comments' and replies' ids. */
async function onLink() {
  const [comments, replies] = await Promise.all([
    services.store.comments(shareId),
    services.store.replies(shareId),
  ]);
  return {
    comments: comments.map((row) => row.item.id),
    replies: replies.map((row) => row.item.id),
  };
}

/** Pushes the owner's comments (with a crop on `withCrop`) and replies, and the crop's bytes. */
async function publish(comments: SharedComment[], replies: SharedReply[] = []) {
  await applyChanges(services, await share(), change({ comments, replies }), NOW);
  for (const comment of comments) {
    if (comment.crop) {
      await services.store.putBlob(shareId, {
        key: `crop:${comment.id}`,
        contentType: "image/png",
        size: PNG.length,
        location: { kind: "inline", bytes: PNG },
      });
    }
  }
}

const CROP = { rect: { x: 0, y: 0, width: 10, height: 10 } };

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  let a: Seat;
  ({ db, a } = await twoWorkspaces());
  owner = a;
  holder.db = db;
  ben = await memberSeat(db, owner.workspaceId, undefined, "Ben Ito");
  cleo = await memberSeat(db, owner.workspaceId, undefined, "Cleo Park");
  await addFolder(db, owner.workspaceId);
  await createProject(db, owner.workspaceId, URL_PROJECT("p1"), NOW);
  services = { store: createPostgresStore(db), blobs: inlineBackend };
  (globalThis as { squintShares?: Promise<ShareServices> }).squintShares =
    Promise.resolve(services);
  const created = await createShare(services, { ...STATE, comments: [], replies: [] }, NOW);
  shareId = created.shareId;
  const { token, ownerKey } = created;
  await db.transaction((tx) =>
    attachShare(tx, owner.workspaceId, "p1", { shareId, token, ownerKey }, NOW, TEST_AUTH_SECRET),
  );
});

describe("who makes a comment team only (D9: its author or the owner, both ways)", () => {
  it("lets the author hide and show their own", async () => {
    await post(ben, "c1");
    const hidden = await patch(ben, "c1", { teamOnly: true });
    expect(hidden.status).toBe(200);
    expect(await hidden.json()).toMatchObject({ id: "c1", teamOnly: true });
    const shown = (await (await patch(ben, "c1", { teamOnly: false })).json()) as Comment;
    expect(shown.teamOnly).toBeUndefined();
  });

  it("lets the owner hide and show anyone's", async () => {
    await post(ben, "c1");
    expect((await patch(owner, "c1", { teamOnly: true })).status).toBe(200);
    expect((await patch(owner, "c1", { teamOnly: false })).status).toBe(200);
  });

  it("refuses another member (404), as for a comment that isn't there", async () => {
    await post(ben, "c1");
    expect((await patch(cleo, "c1", { teamOnly: true })).status).toBe(404);
    await patch(ben, "c1", { teamOnly: true });
    expect((await patch(cleo, "c1", { teamOnly: false })).status).toBe(404);
    expect((await patch(cleo, "nope", { teamOnly: true })).status).toBe(404);
  });

  it("never makes a client's comment team only, not even for the owner (D8)", async () => {
    await db.query(
      `INSERT INTO comments (project_id, id, x, y, body, author_name, origin)
       VALUES ('p1', 'guest', 1, 1, 'Hi', 'Cleo', 'client')`,
    );
    expect((await patch(owner, "guest", { teamOnly: true })).status).toBe(404);
  });

  it("changes who sees it on its own, and never marks it edited", async () => {
    const posted = (await (await post(ben, "c1")).json()) as Comment;
    expect((await patch(ben, "c1", { teamOnly: true, body: "New" })).status).toBe(400);
    const hidden = (await (await patch(ben, "c1", { teamOnly: true })).json()) as Comment;
    expect(hidden).toMatchObject({ body: "Hi", teamOnly: true });
    expect(hidden.editedAt).toBeUndefined();
    expect(hidden.updatedAt).toBeGreaterThanOrEqual(posted.updatedAt);
  });

  it("refuses a guest's comment or reply sent as team only (400)", async () => {
    expect((await post(owner, "c1", { fromShare: true, teamOnly: true })).status).toBe(400);
    await post(owner, "c2");
    expect((await reply(owner, "c2", "r1", { fromShare: true, teamOnly: true })).status).toBe(400);
  });

  it("posts a team-only comment, and a reply that asks, as team only", async () => {
    const posted = (await (await post(ben, "c1", { teamOnly: true })).json()) as Comment;
    expect(posted.teamOnly).toBe(true);
    await post(ben, "c2");
    const added = (await (await reply(ben, "c2", "r1", { teamOnly: true })).json()) as Reply;
    expect(added.teamOnly).toBe(true);
  });
});

describe("a comment a client replied to (D10)", () => {
  it("can't be made team only once the reply is pulled (409)", async () => {
    await post(owner, "c1");
    await db.query(
      `INSERT INTO comment_replies (project_id, comment_id, id, body, author_name, origin)
       VALUES ('p1', 'c1', 'k1', 'Hm', 'Cleo', 'client')`,
    );
    const refused = await patch(owner, "c1", { teamOnly: true });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "has-client-replies" });
  });

  it("can't be made team only while the reply is still on the link (409), and stays there", async () => {
    await post(owner, "c1");
    await publish([shared("c1")]);
    expect(
      await services.store.addClientReply(shareId, sharedReply("k1", "c1"), {
        link: 10,
        comment: 10,
      }),
    ).toBe("added");
    expect((await patch(owner, "c1", { teamOnly: true })).status).toBe(409);
    expect(await onLink()).toEqual({ comments: ["c1"], replies: ["k1"] });
  });
});

describe("making a comment team only takes it off the link at once (layer 1)", () => {
  it("deletes its row, its team replies and its crop before the change answers", async () => {
    await post(owner, "c1", { crop: { blobKey: "crop:c1", rect: CROP.rect } });
    await reply(owner, "c1", "r1");
    await publish([shared("c1", { crop: CROP })], [sharedReply("r1", "c1")]);
    expect(await readBlob(services, await share(), "crop:c1")).not.toBeNull();
    expect((await patch(owner, "c1", { teamOnly: true })).status).toBe(200);
    expect(await onLink()).toEqual({ comments: [], replies: [] });
    expect(await readBlob(services, await share(), "crop:c1")).toBeNull();
    expect(await services.store.blobSizes(shareId)).toEqual([]);
  });

  it("deletes a reply made team only from the link, and leaves its comment", async () => {
    await post(owner, "c1");
    await reply(ben, "c1", "r1");
    await publish([shared("c1")], [sharedReply("r1", "c1")]);
    const hidden = await patchReply(ben, "c1", "r1", { teamOnly: true });
    expect(hidden.status).toBe(200);
    expect(await hidden.json()).toMatchObject({ id: "r1", teamOnly: true });
    expect(await onLink()).toEqual({ comments: ["c1"], replies: [] });
    expect((await patchReply(cleo, "c1", "r1", { teamOnly: false })).status).toBe(404);
    expect((await patchReply(owner, "c1", "r1", { teamOnly: false })).status).toBe(200);
  });

  it("refuses a reply change under a team-only comment, and a reply patch of both or neither", async () => {
    await post(owner, "c1", { teamOnly: true });
    await reply(owner, "c1", "r1");
    expect((await patchReply(owner, "c1", "r1", { teamOnly: false })).status).toBe(404);
    expect((await patchReply(owner, "c1", "r1", { teamOnly: true, body: "x" })).status).toBe(400);
    expect((await patchReply(owner, "c1", "r1", {})).status).toBe(400);
  });

  it("keeps serving the crop of a comment clients see (an owner's row, at `crop:<id>`)", async () => {
    await post(owner, "c1");
    await publish([shared("c1", { crop: CROP })]);
    const served = await readBlob(services, await share(), "crop:c1");
    expect(served?.bytes).toEqual(PNG);
    expect(await readBlob(services, await share(), "crop:gone")).toBeNull();
  });
});

describe("every push leaves team-only content out (layer 2)", () => {
  it("drops a team-only comment, its replies and a team-only reply, and deletes rows already there", async () => {
    await post(owner, "visible");
    await post(owner, "hidden", { teamOnly: true });
    await reply(owner, "visible", "r-visible");
    await reply(owner, "visible", "r-hidden", { teamOnly: true });
    await reply(owner, "hidden", "r-under");
    // A link pushed before (by an older browser) holds them all.
    await services.store.upsertComment(shareId, shared("hidden"), "owner");
    await services.store.upsertReply(shareId, sharedReply("r-under", "hidden"));
    await publish(
      [shared("visible"), shared("hidden")],
      [
        sharedReply("r-visible", "visible"),
        sharedReply("r-hidden", "visible"),
        sharedReply("r-under", "hidden"),
      ],
    );
    expect(await onLink()).toEqual({ comments: ["visible"], replies: ["r-visible"] });
  });

  it("doesn't put back a comment made team only after the push was built", async () => {
    await post(owner, "c1");
    await reply(owner, "c1", "r1");
    // A stale tab built this push before the flip, and sends it after.
    const stale = change({ comments: [shared("c1")], replies: [sharedReply("r1", "c1")] });
    await publish([shared("c1")], [sharedReply("r1", "c1")]);
    await patch(owner, "c1", { teamOnly: true });
    expect(await onLink()).toEqual({ comments: [], replies: [] });
    expect(await applyChanges(services, await share(), stale, NOW)).toMatchObject({ ok: true });
    expect(await onLink()).toEqual({ comments: [], replies: [] });
  });

  it("publishes only the replies clients saw before, once the comment is shown again (B2)", async () => {
    await post(owner, "c1");
    await reply(owner, "c1", "before");
    await patch(owner, "c1", { teamOnly: true });
    const during = (await (await reply(ben, "c1", "during")).json()) as Reply;
    expect(during.teamOnly).toBe(true);
    await patch(owner, "c1", { teamOnly: false });
    const { rows } = await db.query<{ id: string; team_only: boolean }>(
      "SELECT id, team_only FROM comment_replies ORDER BY id",
    );
    expect(rows).toEqual([
      { id: "before", team_only: false },
      { id: "during", team_only: true },
    ]);
    await publish([shared("c1")], [sharedReply("before", "c1"), sharedReply("during", "c1")]);
    expect(await onLink()).toEqual({ comments: ["c1"], replies: ["before"] });
  });

  it("stores a client's reply pulled under a team-only comment as clients see it (the CHECK holds)", async () => {
    await post(owner, "c1");
    await publish([shared("c1")]);
    await services.store.addClientReply(shareId, sharedReply("k1", "c1"), {
      link: 10,
      comment: 10,
    });
    // Made team only by a path that skips the client-reply check (a stale row, a bypass).
    await db.query("UPDATE comments SET team_only = true WHERE id = 'c1'");
    const pulled = await reply(owner, "c1", "k1", { fromShare: true });
    expect(pulled.status).toBe(201);
    const { rows } = await db.query<{ team_only: boolean; origin: string }>(
      "SELECT team_only, origin FROM comment_replies WHERE id = 'k1'",
    );
    expect(rows).toEqual([{ team_only: false, origin: "client" }]);
  });
});

describe("attaching a link purges team-only content (layer 3)", () => {
  it("deletes the owner's rows of team-only comments and replies a new share was made with", async () => {
    await post(owner, "visible");
    await post(owner, "hidden", { teamOnly: true });
    await reply(owner, "visible", "r-hidden", { teamOnly: true });
    await db.query("DELETE FROM project_share_links");
    const made = await createShare(
      services,
      {
        ...STATE,
        snapshots: [],
        comments: [shared("visible"), shared("hidden", { crop: CROP })],
        replies: [sharedReply("r-hidden", "visible")],
      },
      NOW,
    );
    await services.store.putBlob(made.shareId, {
      key: "crop:hidden",
      contentType: "image/png",
      size: PNG.length,
      location: { kind: "inline", bytes: PNG },
    });
    const attached = await call("PUT", `/api/w/${owner.workspaceId}/projects/p1/share-link`, {
      cookie: owner.cookie,
      body: { shareId: made.shareId, token: made.token, ownerKey: made.ownerKey },
    });
    expect(attached.status).toBe(200);
    shareId = made.shareId;
    expect(await onLink()).toEqual({ comments: ["visible"], replies: [] });
    expect(await services.store.blobSizes(shareId)).toEqual([]);
  });
});
