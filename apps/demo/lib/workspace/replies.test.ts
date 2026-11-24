import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { giveAvatar } from "@/test/members-fixture";
import {
  addFolder,
  memberSeat,
  NOW,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { personAvatarSrc } from "../routes";
import { logoVersion } from "../share/brand";
import type { Comment, Reply } from "../store/types";
import { personKey } from "./members/person-key";
import { createProject, restoreProject, trashProject } from "./projects";
import { listReplies } from "./replies";
import { toDate } from "./times";

/**
 * Replies through the routes (4.1, 4.7, D1, D5, D8): who a reply is by comes
 * from the session, only its author changes its words, the author or the
 * owner deletes it, and it never changes its comment.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let db: Database;
let owner: Seat;
let ben: Seat;
let outsider: Seat;

const comments = (seat: Seat) => `/api/w/${seat.workspaceId}/projects/p1/comments`;
const replies = (seat: Seat, comment = "c1") => `${comments(seat)}/${comment}/replies`;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  // The routes read the time from `Date.now()`: replies are posted and edited at NOW.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  let b: Seat;
  ({ db, a: owner, b } = await twoWorkspaces());
  outsider = b;
  holder.db = db;
  await db.query("UPDATE users SET name = 'Dailen' WHERE id = $1", [owner.userId]);
  ben = await memberSeat(db, owner.workspaceId, undefined, "Ben Ito");
  await addFolder(db, owner.workspaceId);
  await createProject(db, owner.workspaceId, URL_PROJECT("p1"), NOW);
  const posted = await call("POST", comments(owner), {
    cookie: owner.cookie,
    body: { id: "c1", x: 1, y: 1, body: "Bigger logo", author: "Dailen" },
  });
  expect(posted.status).toBe(201);
});

function post(who: Seat, id: string, extra: Record<string, unknown> = {}, comment = "c1") {
  return call("POST", replies(owner, comment), {
    cookie: who.cookie,
    body: { id, body: "On it", author: "Somebody Else", ...extra },
    headers: { "user-agent": "Mozilla/5.0 (Test)" },
  });
}

const patch = (who: Seat, id: string, body: unknown) =>
  call("PATCH", `${replies(owner)}/${id}`, { cookie: who.cookie, body });
const remove = (who: Seat, id: string) =>
  call("DELETE", `${replies(owner)}/${id}`, { cookie: who.cookie });

const list = (who: Seat) => listReplies(db, owner.workspaceId, undefined, who.userId);

/** A guest's reply, as the review link will bring it in (054/PR 5): no account, origin 'client'. */
async function clientReply(id: string) {
  await db.query(
    `INSERT INTO comment_replies (project_id, comment_id, id, body, author_name, origin, created_at)
     VALUES ('p1', 'c1', $1, 'From the client', 'Cleo', 'client', $2)`,
    [id, toDate(NOW)],
  );
}

describe("posting a reply", () => {
  it("is the session's member's, under their own name, and leaves the comment as it was (D5, D8)", async () => {
    const posted = await post(ben, "r1");
    expect(posted.status).toBe(201);
    expect(await posted.json()).toMatchObject({
      id: "r1",
      projectId: "p1",
      commentId: "c1",
      body: "On it",
      author: "Ben Ito",
      mine: true,
    });
    const { rows } = await db.query<{ author_user_id: string; author_name: string }>(
      "SELECT author_user_id, author_name FROM comment_replies WHERE id = 'r1'",
    );
    expect(rows).toEqual([{ author_user_id: ben.userId, author_name: "Ben Ito" }]);
    const [comment] = (await (
      await call("GET", comments(owner), { cookie: owner.cookie })
    ).json()) as Comment[];
    expect(comment).toMatchObject({ status: "active" });
    expect(comment).not.toHaveProperty("editedAt");
  });

  it("is allowed on a resolved comment, which stays resolved", async () => {
    await call("PATCH", `${comments(owner)}/c1`, {
      cookie: ben.cookie,
      body: { status: "resolved" },
    });
    expect((await post(ben, "r1")).status).toBe(201);
    const { rows } = await db.query("SELECT status FROM comments WHERE id = 'c1'");
    expect(rows).toEqual([{ status: "resolved" }]);
  });

  it("records the browser with the request's user agent, unless an Undo brings its own", async () => {
    const viewport = { width: 1440, height: 900 };
    const fresh = (await (await post(ben, "r1", { clientInfo: { viewport } })).json()) as Reply;
    expect(fresh.clientInfo).toEqual({ viewport, userAgent: "Mozilla/5.0 (Test)" });
    const kept = { viewport, userAgent: "Original UA" };
    const undone = (await (await post(ben, "r2", { clientInfo: kept })).json()) as Reply;
    expect(undone.clientInfo).toEqual(kept);
    const bare = (await (await post(ben, "r3")).json()) as Reply;
    expect(bare).not.toHaveProperty("clientInfo");
  });

  it("answers 404 for an unknown comment or project, and 409 for a taken id", async () => {
    expect((await post(ben, "r1", {}, "nope")).status).toBe(404);
    const elsewhere = await call(
      "POST",
      `/api/w/${owner.workspaceId}/projects/p2/comments/c1/replies`,
      {
        cookie: ben.cookie,
        body: { id: "r1", body: "Hi", author: "Ben" },
      },
    );
    expect(elsewhere.status).toBe(404);
    expect((await post(ben, "r1")).status).toBe(201);
    const again = await post(owner, "r1", { body: "Not mine" });
    expect(again.status).toBe(409);
    const { rows } = await db.query("SELECT body FROM comment_replies");
    expect(rows).toEqual([{ body: "On it" }]);
  });

  it("refuses an empty reply", async () => {
    expect((await post(ben, "r1", { body: "   " })).status).toBe(400);
  });
});

describe("who may change a reply (4.7, D1)", () => {
  it("lets only the author change the words; the owner gets a 404 like a missing reply", async () => {
    await post(ben, "r1");
    expect((await patch(owner, "r1", { body: "Owner's words" })).status).toBe(404);
    const edited = await patch(ben, "r1", { body: "Ben's words" });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ body: "Ben's words", editedAt: NOW, mine: true });
  });

  it("marks it edited only when the words change", async () => {
    await post(ben, "r1");
    const same = (await (await patch(ben, "r1", { body: "On it" })).json()) as Reply;
    expect(same).not.toHaveProperty("editedAt");
  });

  it("lets a member delete only their own, and the owner anyone's", async () => {
    await post(owner, "owners");
    await post(ben, "bens");
    await post(ben, "bens-2");
    expect((await remove(ben, "owners")).status).toBe(404);
    expect((await remove(ben, "bens")).status).toBe(204);
    expect((await remove(owner, "bens-2")).status).toBe(204);
    expect((await list(owner)).map((reply) => reply.id)).toEqual(["owners"]);
  });

  it("lets nobody edit a client's reply, and only the owner delete it", async () => {
    await clientReply("guest-1");
    expect((await patch(ben, "guest-1", { body: "Changed" })).status).toBe(404);
    expect((await patch(owner, "guest-1", { body: "Changed" })).status).toBe(404);
    expect((await remove(ben, "guest-1")).status).toBe(404);
    expect((await remove(owner, "guest-1")).status).toBe(204);
  });

  it("finds nothing of another workspace's, nor under another comment", async () => {
    await post(ben, "r1");
    const foreign = `/api/w/${outsider.workspaceId}/projects/p1/comments/c1/replies`;
    expect(
      (
        await call("POST", foreign, {
          cookie: outsider.cookie,
          body: { id: "r2", body: "Hi", author: "Bo" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call("PATCH", `${foreign}/r1`, { cookie: outsider.cookie, body: { body: "x" } }))
        .status,
    ).toBe(404);
    expect((await call("DELETE", `${foreign}/r1`, { cookie: outsider.cookie })).status).toBe(404);
    expect(
      (await call("DELETE", `${comments(owner)}/other/replies/r1`, { cookie: owner.cookie }))
        .status,
    ).toBe(404);
    expect((await list(owner)).map((reply) => reply.id)).toEqual(["r1"]);
  });
});

describe("reading replies", () => {
  it("says which are mine to each member, oldest first, and never anyone's id", async () => {
    await post(ben, "bens", { createdAt: NOW - 2_000 });
    await post(owner, "owners", { createdAt: NOW - 1_000 });
    await clientReply("guest-1");
    const forOwner = await list(owner);
    expect(forOwner.map((reply) => [reply.id, reply.mine, reply.fromClient])).toEqual([
      ["bens", undefined, undefined],
      ["owners", true, undefined],
      ["guest-1", undefined, true],
    ]);
    expect((await list(ben)).map((reply) => reply.mine)).toEqual([true, undefined, undefined]);
    expect(JSON.stringify(forOwner)).not.toContain(ben.userId);
    expect(JSON.stringify(forOwner)).not.toContain(owner.userId);
  });

  it("shows a team author's name as it is now, the posted one once the account has none", async () => {
    await post(ben, "r1");
    await db.query("UPDATE users SET name = 'Benjamin Ito' WHERE id = $1", [ben.userId]);
    expect((await list(owner))[0]?.author).toBe("Benjamin Ito");
    await db.query("UPDATE users SET name = NULL WHERE id = $1", [ben.userId]);
    expect((await list(owner))[0]?.author).toBe("Ben Ito");
    await db.query("DELETE FROM users WHERE id = $1", [ben.userId]);
    expect((await list(owner))[0]).toMatchObject({ author: "Ben Ito" });
  });

  it("gives an active member's photo by their person key, and none once they've left", async () => {
    await giveAvatar(db, ben.userId);
    await post(ben, "r1");
    await post(owner, "r2");
    const expected = personAvatarSrc(
      owner.workspaceId,
      personKey(owner.workspaceId, ben.userId),
      logoVersion(`user/${ben.userId}/avatar/a1`),
    );
    const [bens, owners] = await list(owner);
    expect(bens?.authorAvatar).toBe(expected);
    expect(owners).not.toHaveProperty("authorAvatar");
    await db.query("DELETE FROM memberships WHERE user_id = $1", [ben.userId]);
    expect((await list(owner))[0]).not.toHaveProperty("authorAvatar");
  });

  it("leaves out a trashed project's replies, and has them again once it's restored", async () => {
    await post(ben, "r1");
    await trashProject(db, owner.workspaceId, "p1", NOW);
    expect(await list(owner)).toEqual([]);
    expect((await post(ben, "r2")).status).toBe(404);
    expect((await remove(ben, "r1")).status).toBe(404);
    await restoreProject(db, owner.workspaceId, "p1");
    expect((await list(owner)).map((reply) => reply.id)).toEqual(["r1"]);
  });

  it("goes with its comment", async () => {
    await post(ben, "r1");
    expect((await call("DELETE", `${comments(owner)}/c1`, { cookie: owner.cookie })).status).toBe(
      204,
    );
    expect(await list(owner)).toEqual([]);
  });
});

describe("Undo after deleting one's own reply (4.1)", () => {
  it("brings it back as theirs, at its time, still edited, with editedAt kept between then and now", async () => {
    await post(ben, "r1", { createdAt: NOW - 5_000 });
    await patch(ben, "r1", { body: "Second thoughts" });
    const [before] = await list(ben);
    expect((await remove(ben, "r1")).status).toBe(204);
    const { projectId: _p, commentId: _c, mine: _m, ...body } = before as Reply;
    expect((await post(ben, "r1", body)).status).toBe(201);
    expect((await list(ben))[0]).toEqual(before);
    await remove(ben, "r1");
    const future = (await (
      await post(ben, "r1", { ...body, editedAt: NOW + 60_000 })
    ).json()) as Reply;
    expect(future.editedAt).toBe(NOW);
    await remove(ben, "r1");
    const early = (await (await post(ben, "r1", { ...body, editedAt: 1 })).json()) as Reply;
    expect(early.editedAt).toBe(NOW - 5_000);
  });
});
