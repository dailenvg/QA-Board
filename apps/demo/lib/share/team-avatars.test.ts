import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as avatarRoute from "@/app/api/s/[token]/people/[key]/avatar/route";
import * as unlockRoute from "@/app/api/s/[token]/unlock/route";
import * as pushRoute from "@/app/api/shares/[shareId]/route";
import type * as DatabaseModule from "@/lib/db/database";
import type * as ShareServerModule from "@/lib/share/server";
import {
  addMember,
  giveAvatar,
  membersWorld,
  removeMember,
  type MembersWorld,
  type Person,
} from "@/test/members-fixture";
import { STATE } from "@/test/share-fixture";
import { addFolder, NOW, PNG, TEST_AUTH_SECRET, URL_PROJECT } from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { addComment } from "../workspace/comments";
import { addReply } from "../workspace/replies";
import { personKey } from "../workspace/members/person-key";
import { createProject, trashProject } from "../workspace/projects";
import { attachShare } from "../workspace/share-links";
import { toDate } from "../workspace/times";
import { inlineBackend } from "./blob-backend";
import { createMemoryStore } from "./memory-store";
import { OWNER_KEY_HEADER } from "./http-headers";
import { createPostgresStore } from "./postgres-store";
import { addClientComment, clientShare, clientView, createShare } from "./service";
import { SHARE_PERSON_KEY, shareAvatarVersion, sharePersonKey } from "./share-people";
import type { ClientComment, CreatedShare, SharedComment, SharedReply } from "./types";

/**
 * The team on a review link (4.11): which comments say they're the team's,
 * the avatars they carry (by keys and versions of the link's own), and the
 * guest route that serves them, behind the link's password.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

vi.mock("@/lib/share/server", async (importOriginal) => ({
  ...(await importOriginal<typeof ShareServerModule>()),
  shareServices: () =>
    Promise.resolve({ store: createPostgresStore(holder.db as Database), blobs: inlineBackend }),
}));

const PASSWORD = "correct horse battery";

let world: MembersWorld;
let ben: Person;
let address = 0;

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.stubEnv("VERCEL", "");
  world = await membersWorld();
  holder.db = world.db;
  ben = await addMember(world.db, world.workspaceId, undefined, "ben@acme.test");
  await world.db.query("UPDATE users SET name = 'Ben Ito' WHERE id = $1", [ben.user.id]);
  await addFolder(world.db, world.workspaceId);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const services = () => ({ store: createPostgresStore(world.db), blobs: inlineBackend });

/** Gives `who` an avatar whose bytes sit in its row (the inline driver reads them). */
async function inlineAvatar(who: Person): Promise<string> {
  await giveAvatar(world.db, who.user.id);
  await world.db.query("UPDATE user_blobs SET blob_url = NULL, bytes = $2 WHERE user_id = $1", [
    who.user.id,
    PNG,
  ]);
  return `user/${who.user.id}/avatar/a1`;
}

const shared = (id: string): SharedComment => ({
  id,
  x: 1,
  y: 1,
  body: `Comment ${id}`,
  author: "Someone",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

/**
 * Project `projectId` with a comment by each of `authors` (by comment id; a
 * null author is a client's comment pulled into the workspace), and its review
 * link holding all of them, as the owner pushed them.
 */
async function linkedProject(
  projectId: string,
  authors: Record<string, Person | null>,
): Promise<CreatedShare> {
  await createProject(world.db, world.workspaceId, URL_PROJECT(projectId), NOW);
  for (const [id, author] of Object.entries(authors)) {
    const input = {
      id,
      x: 1,
      y: 1,
      body: `Comment ${id}`,
      author: "Cleo",
      status: "active" as const,
    };
    await addComment(world.db, world.workspaceId, projectId, input, author?.user.id ?? null, NOW);
  }
  const state = { ...STATE, snapshots: [], comments: Object.keys(authors).map(shared) };
  const created = await createShare(services(), state, Date.now());
  const attached = await world.db.transaction((tx) =>
    attachShare(
      tx,
      world.workspaceId,
      projectId,
      { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey },
      NOW,
      TEST_AUTH_SECRET,
    ),
  );
  expect(attached.ok).toBe(true);
  return created;
}

async function guestView(created: CreatedShare) {
  const { store } = services();
  const share = await clientShare(store, created.token, Date.now());
  if (!share) throw new Error("share closed");
  return clientView(store, share, created.token);
}

const byId = (comments: readonly ClientComment[], id: string) =>
  comments.find((comment) => comment.id === id);

/** The key and version in a guest's avatar URL. */
function avatarParts(src: string | undefined) {
  const match = /^\/api\/s\/[^/]+\/people\/([^/]+)\/avatar\?v=(.+)$/.exec(src ?? "");
  if (!match) throw new Error(`not an avatar URL: ${src}`);
  return { key: match[1] ?? "", version: match[2] ?? "" };
}

function avatarOf(token: string, key: string, version: string, cookie?: string) {
  address += 1;
  const request = new Request(`http://localhost/api/s/${token}/people/${key}/avatar?v=${version}`, {
    headers: {
      "x-forwarded-for": `203.0.113.${address % 250}`,
      ...(cookie ? { cookie } : {}),
    },
  });
  return avatarRoute.GET(request, { params: Promise.resolve({ token, key }) });
}

describe("a review link's team", () => {
  it("marks the team's comments, with an avatar only for members who have one", async () => {
    const anaAvatar = await inlineAvatar(world.owner);
    const created = await linkedProject("p1", { "c-ana": world.owner, "c-ben": ben, "c-k": null });
    const record = await services().store.byId(created.shareId);
    if (!record) throw new Error("no share");
    const posted = await addClientComment(
      services(),
      record,
      { id: "c-guest", x: 2, y: 2, body: "From the client", author: "Cleo" },
      null,
      Date.now(),
    );
    expect(posted.ok).toBe(true);

    const { comments } = await guestView(created);
    const ana = byId(comments, "c-ana");
    expect(ana).toMatchObject({ team: true });
    expect(avatarParts(ana?.authorAvatar)).toEqual({
      key: sharePersonKey(created.shareId, world.owner.user.id),
      version: shareAvatarVersion(created.shareId, anaAvatar),
    });
    expect(byId(comments, "c-ben")).toEqual({ ...shared("c-ben"), team: true });
    // A client's comment, even pushed back by the owner, and a guest's own: never the team's.
    expect(byId(comments, "c-k")).toEqual(shared("c-k"));
    expect(byId(comments, "c-guest")).not.toHaveProperty("team");
    expect(byId(comments, "c-guest")).not.toHaveProperty("authorAvatar");

    const wire = JSON.stringify(comments);
    for (const secret of [
      world.workspaceId,
      world.owner.user.id,
      world.owner.user.email,
      ben.user.id,
      ben.user.email,
      personKey(world.workspaceId, world.owner.user.id),
      anaAvatar,
    ]) {
      expect(wire).not.toContain(secret);
    }
  });

  it("gives a removed or deleted author no avatar, but keeps them on the team", async () => {
    await inlineAvatar(ben);
    const lea = await addMember(world.db, world.workspaceId);
    await inlineAvatar(lea);
    const created = await linkedProject("p1", { "c-ben": ben, "c-lea": lea });
    expect(byId((await guestView(created)).comments, "c-ben")).toHaveProperty("authorAvatar");

    await removeMember(world.db, ben.user.id, world.workspaceId, Date.now());
    await world.db.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
      lea.user.id,
      toDate(NOW),
      toDate(NOW + 1000),
    ]);
    const { comments } = await guestView(created);
    expect(byId(comments, "c-ben")).toEqual({ ...shared("c-ben"), team: true });
    expect(byId(comments, "c-lea")).toEqual({ ...shared("c-lea"), team: true });
  });

  it("names the same person by another key and version on each link", async () => {
    await inlineAvatar(ben);
    const one = await linkedProject("p1", { "c-1": ben });
    const two = await linkedProject("p2", { "c-2": ben });
    const first = avatarParts(byId((await guestView(one)).comments, "c-1")?.authorAvatar);
    const second = avatarParts(byId((await guestView(two)).comments, "c-2")?.authorAvatar);
    expect(first.key).not.toBe(second.key);
    expect(first.version).not.toBe(second.version);
    for (const { key } of [first, second]) {
      expect(key).not.toContain(ben.user.id.slice(0, 8));
      expect(key).not.toBe(personKey(world.workspaceId, ben.user.id));
    }
  });

  it("can't be planted by the owner's push: a client's comment stays a client's", async () => {
    const created = await linkedProject("p1", { "c-k": null });
    const planted = {
      ...shared("c-k"),
      body: "Pushed again",
      mine: true,
      team: true,
      authorAvatar: `/api/s/${created.token}/people/${"A".repeat(22)}/avatar?v=1`,
    };
    const pushed = await pushRoute.PATCH(
      new Request(`http://localhost:3000/api/shares/${created.shareId}`, {
        method: "PATCH",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.249",
          cookie: world.owner.cookie,
          [OWNER_KEY_HEADER]: created.ownerKey,
        },
        body: JSON.stringify({ comments: [planted], cursor: 0 }),
      }),
      { params: Promise.resolve({ shareId: created.shareId }) },
    );
    expect(pushed.status).toBe(200);
    const [row] = await services().store.comments(created.shareId);
    expect(row?.item).toEqual({ ...shared("c-k"), body: "Pushed again" });
    expect(byId((await guestView(created)).comments, "c-k")).toEqual(row?.item);
  });

  it("is empty on an anonymous share, while the project is in the trash, and in memory", async () => {
    await inlineAvatar(ben);
    const created = await linkedProject("p1", { "c-ben": ben });
    const anonymous = await createShare(services(), STATE, Date.now());
    const { store } = services();
    expect(await store.teamAuthors(anonymous.shareId)).toEqual(new Map());
    const team = await store.teamAuthors(created.shareId);
    expect([...team.keys()]).toEqual(["c-ben"]);
    expect(team.get("c-ben")?.key).toMatch(SHARE_PERSON_KEY);
    await trashProject(world.db, world.workspaceId, "p1", NOW);
    expect(await store.teamAuthors(created.shareId)).toEqual(new Map());
    expect(await createMemoryStore().teamAuthors("any")).toEqual(new Map());
  });
});

describe("a review link's team, in replies", () => {
  const sharedReply = (id: string, commentId: string): SharedReply => ({
    id,
    commentId,
    body: `Reply ${id}`,
    author: "Someone",
    createdAt: NOW,
  });

  /**
   * On project p1's link (comments c-ana and c-k): Ben's reply r-ben, a
   * client's reply r-k pulled into the workspace, and r-new, which the
   * workspace doesn't have, all pushed by the owner.
   */
  async function linkedReplies() {
    const created = await linkedProject("p1", { "c-ana": world.owner, "c-k": null });
    const posted = await addReply(
      world.db,
      world.workspaceId,
      "p1",
      "c-k",
      { id: "r-ben", body: "On it", author: "Ben" },
      { kind: "team", userId: ben.user.id },
      NOW,
    );
    expect(posted.ok).toBe(true);
    await world.db.query(
      `INSERT INTO comment_replies (project_id, comment_id, id, body, author_name, origin)
       VALUES ('p1', 'c-ana', 'r-k', 'Thanks', 'Cleo', 'client')`,
    );
    const { store } = services();
    const pushed = [
      sharedReply("r-ben", "c-k"),
      sharedReply("r-k", "c-ana"),
      sharedReply("r-new", "c-ana"),
    ];
    for (const reply of pushed) await store.upsertReply(created.shareId, reply);
    return created;
  }

  it("marks the team's replies, with an avatar for members who have one, and no one else's", async () => {
    const benAvatar = await inlineAvatar(ben);
    const created = await linkedReplies();
    const { replies } = await guestView(created);
    const benReply = replies.find((reply) => reply.id === "r-ben");
    expect(benReply).toMatchObject({ team: true });
    expect(avatarParts(benReply?.authorAvatar)).toEqual({
      key: sharePersonKey(created.shareId, ben.user.id),
      version: shareAvatarVersion(created.shareId, benAvatar),
    });
    // A client's reply, even pushed back by the owner, and one the workspace doesn't know.
    expect(replies.find((reply) => reply.id === "r-k")).toEqual(sharedReply("r-k", "c-ana"));
    expect(replies.find((reply) => reply.id === "r-new")).toEqual(sharedReply("r-new", "c-ana"));
    const wire = JSON.stringify(replies);
    for (const secret of [ben.user.id, ben.user.email, benAvatar, world.workspaceId]) {
      expect(wire).not.toContain(secret);
    }
  });

  it("keeps a removed author on the team without an avatar, and is empty once the project is in the trash", async () => {
    await inlineAvatar(ben);
    const created = await linkedReplies();
    await removeMember(world.db, ben.user.id, world.workspaceId, Date.now());
    const { replies } = await guestView(created);
    expect(replies.find((reply) => reply.id === "r-ben")).toEqual({
      ...sharedReply("r-ben", "c-k"),
      team: true,
    });
    const { store } = services();
    expect([...(await store.teamReplyAuthors(created.shareId)).keys()]).toEqual(["r-ben"]);
    await trashProject(world.db, world.workspaceId, "p1", NOW);
    expect(await store.teamReplyAuthors(created.shareId)).toEqual(new Map());
  });

  it("can't be planted by the owner's push: what it says of a reply's author is dropped", async () => {
    const created = await linkedReplies();
    const planted = {
      ...sharedReply("r-new", "c-ana"),
      body: "Pushed again",
      team: true,
      authorAvatar: `/api/s/${created.token}/people/${"A".repeat(22)}/avatar?v=1`,
      clientInfo: { userAgent: "Mozilla/5.0" },
    };
    const pushed = await pushRoute.PATCH(
      new Request(`http://localhost:3000/api/shares/${created.shareId}`, {
        method: "PATCH",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.248",
          cookie: world.owner.cookie,
          [OWNER_KEY_HEADER]: created.ownerKey,
        },
        body: JSON.stringify({ replies: [planted], cursor: 0 }),
      }),
      { params: Promise.resolve({ shareId: created.shareId }) },
    );
    expect(pushed.status).toBe(200);
    const { replies } = await guestView(created);
    expect(replies.find((reply) => reply.id === "r-new")).toEqual({
      ...sharedReply("r-new", "c-ana"),
      body: "Pushed again",
    });
    const { rows } = await world.db.query<{ data: unknown; client_info: unknown }>(
      "SELECT data, client_info FROM squint_share_replies WHERE id = 'r-new'",
    );
    expect(rows).toEqual([
      { data: { ...sharedReply("r-new", "c-ana"), body: "Pushed again" }, client_info: null },
    ]);
  });
});

describe("GET /api/s/:token/people/:key/avatar", () => {
  beforeEach(async () => {
    await inlineAvatar(ben);
  });

  /** A link of project `projectId` with a comment of Ben's: its share, and his key and version there. */
  async function benOnLink(projectId = "p1") {
    const created = await linkedProject(projectId, { [`c-${projectId}`]: ben });
    const src = byId((await guestView(created)).comments, `c-${projectId}`)?.authorAvatar;
    return { created, ...avatarParts(src) };
  }

  it("serves the avatar at its version on this link, kept privately for a few minutes", async () => {
    const { created, key, version } = await benOnLink();
    const response = await avatarOf(created.token, key, version);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it("serves the current photo at any other version, never cached: a review open since it changed", async () => {
    const { created, key } = await benOnLink("p1");
    const other = await benOnLink("p2");
    for (const stale of ["stale", other.version]) {
      const response = await avatarOf(created.token, key, stale);
      expect(response.status, stale).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
    }
  });

  it("answers 404 for an unknown key, and another link's or the app's key", async () => {
    const { created, key, version } = await benOnLink("p1");
    const other = await benOnLink("p2");
    const outsider = await addMember(world.db, world.other.workspaceId);
    await inlineAvatar(outsider);
    const refused = [
      ["A".repeat(22), version],
      ["not-a-key", version],
      [other.key, other.version],
      [other.key, version],
      [personKey(world.workspaceId, ben.user.id), version],
      [sharePersonKey(created.shareId, outsider.user.id), version],
    ] as const;
    for (const [asked, at] of refused) {
      expect((await avatarOf(created.token, asked, at)).status, `${asked} ${at}`).toBe(404);
    }
    expect((await avatarOf("x".repeat(43), key, version)).status).toBe(404);
  });

  it("answers 404 once the member is removed, or has deleted their account", async () => {
    const { created, key, version } = await benOnLink();
    const lea = await addMember(world.db, world.workspaceId);
    const leaAvatar = await inlineAvatar(lea);
    const leaKey = sharePersonKey(created.shareId, lea.user.id);
    const leaVersion = shareAvatarVersion(created.shareId, leaAvatar);
    expect((await avatarOf(created.token, leaKey, leaVersion)).status).toBe(200);

    await removeMember(world.db, ben.user.id, world.workspaceId, Date.now());
    await world.db.query("UPDATE users SET deleted_at = $2, delete_after = $3 WHERE id = $1", [
      lea.user.id,
      toDate(NOW),
      toDate(NOW + 1000),
    ]);
    expect((await avatarOf(created.token, key, version)).status).toBe(404);
    expect((await avatarOf(created.token, leaKey, leaVersion)).status).toBe(404);
  });

  it("stays behind the link's password like the review, and opens with its pass", async () => {
    const { created, key, version } = await benOnLink();
    const set = await call("PUT", `/api/w/${world.workspaceId}/projects/p1/share-link/password`, {
      cookie: world.owner.cookie,
      body: { password: PASSWORD },
    });
    expect(set.status).toBe(200);
    const locked = await avatarOf(created.token, key, version);
    expect(locked.status).toBe(401);
    expect(await locked.json()).toEqual({ error: "password-required" });

    const unlock = await unlockRoute.POST(
      new Request(`http://localhost/api/s/${created.token}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.250" },
        body: JSON.stringify({ password: PASSWORD }),
      }),
      { params: Promise.resolve({ token: created.token }) },
    );
    expect(unlock.status).toBe(200);
    const pass = (unlock.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    expect((await avatarOf(created.token, key, version, pass)).status).toBe(200);
  });
});
