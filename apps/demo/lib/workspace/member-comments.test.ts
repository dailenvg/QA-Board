import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { STATE } from "@/test/share-fixture";
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
import type { Comment } from "../store/types";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import { createProject } from "./projects";
import { attachShare } from "./share-links";

/**
 * Comments with several people in a workspace, through the routes (decision
 * 6, A6, A7, A20, 4.9): who a comment is by comes from the session, only its
 * author changes its words, anyone resolves, and the owner deletes anyone's.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let db: Database;
let owner: Seat;
let ben: Seat;
let shareId: string;

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  let a: Seat;
  ({ db, a } = await twoWorkspaces());
  owner = a;
  holder.db = db;
  await db.query("UPDATE users SET name = 'Dailen' WHERE id = $1", [owner.userId]);
  ben = await memberSeat(db, owner.workspaceId, undefined, "Ben Ito");
  await addFolder(db, owner.workspaceId);
  await createProject(db, owner.workspaceId, URL_PROJECT("p1"), NOW);
  const store = createPostgresStore(db);
  const created = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
  shareId = created.shareId;
  const { token, ownerKey } = created;
  await db.transaction((tx) =>
    attachShare(tx, owner.workspaceId, "p1", { shareId, token, ownerKey }, NOW, TEST_AUTH_SECRET),
  );
  await store.insertComment(
    shareId,
    {
      id: "guest-1",
      x: 1,
      y: 1,
      body: "From the client",
      author: "Cleo",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
    "client",
  );
});

const path = (rest = "") => `/api/w/${owner.workspaceId}/projects/p1/comments${rest}`;

function post(who: Seat, id: string, extra: Record<string, unknown> = {}) {
  return call("POST", path(), {
    cookie: who.cookie,
    body: { id, x: 1, y: 1, body: "Hi", author: "Somebody Else", ...extra },
  });
}

const patch = (who: Seat, id: string, body: unknown) =>
  call("PATCH", path(`/${id}`), { cookie: who.cookie, body });
const remove = (who: Seat, id: string) => call("DELETE", path(`/${id}`), { cookie: who.cookie });

async function list(who: Seat): Promise<Comment[]> {
  return (await (await call("GET", path(), { cookie: who.cookie })).json()) as Comment[];
}

describe("who a comment is by (A6)", () => {
  it("is always the session's member, under their own name, whatever `author` says", async () => {
    const posted = await post(ben, "c1");
    expect(posted.status).toBe(201);
    expect(await posted.json()).toMatchObject({ author: "Ben Ito", mine: true });
    const { rows } = await db.query<{ author_user_id: string; author_name: string }>(
      "SELECT author_user_id, author_name FROM comments WHERE id = 'c1'",
    );
    expect(rows).toEqual([{ author_user_id: ben.userId, author_name: "Ben Ito" }]);
  });

  it("says which are mine to each member, and never anyone's id (A20)", async () => {
    await post(ben, "bens");
    await post(owner, "owners");
    const forOwner = await list(owner);
    expect(forOwner.map((comment) => [comment.id, comment.mine])).toEqual([
      ["bens", undefined],
      ["owners", true],
    ]);
    expect((await list(ben)).map((comment) => comment.mine)).toEqual([true, undefined]);
    expect(JSON.stringify(forOwner)).not.toContain(ben.userId);
  });
});

describe("what each member may change (A7, decision 6)", () => {
  it("lets only the author change the words; the owner gets a 404 like a missing comment", async () => {
    await post(ben, "c1");
    expect((await patch(owner, "c1", { body: "Owner's words" })).status).toBe(404);
    const edited = await patch(ben, "c1", { body: "Ben's words" });
    expect(edited.status).toBe(200);
    const comment = (await edited.json()) as Comment;
    expect(comment.body).toBe("Ben's words");
    expect(comment.editedAt).toBeGreaterThan(0);
  });

  it("lets anyone resolve and reopen anyone's", async () => {
    await post(owner, "c1");
    expect(await (await patch(ben, "c1", { status: "resolved" })).json()).toMatchObject({
      status: "resolved",
    });
    expect((await patch(ben, "c1", { status: "active" })).status).toBe(200);
  });

  it("lets a member delete only their own, and the owner anyone's", async () => {
    await post(owner, "owners");
    await post(ben, "bens");
    await post(ben, "bens-2");
    expect((await remove(ben, "owners")).status).toBe(404);
    expect((await remove(ben, "bens")).status).toBe(204);
    expect((await remove(owner, "bens-2")).status).toBe(204);
    expect((await list(owner)).map((comment) => comment.id)).toEqual(["owners"]);
  });

  it("lets only the owner delete a client's comment", async () => {
    expect((await post(owner, "guest-1", { fromShare: true })).status).toBe(201);
    expect((await patch(ben, "guest-1", { body: "Changed" })).status).toBe(404);
    expect((await remove(ben, "guest-1")).status).toBe(404);
    expect((await remove(owner, "guest-1")).status).toBe(204);
  });
});

describe("Undo after a delete (4.9)", () => {
  it("brings a member's own comment back as theirs, still edited", async () => {
    await post(ben, "c1");
    await patch(ben, "c1", { body: "Second thoughts" });
    const [before] = await list(ben);
    expect((await remove(ben, "c1")).status).toBe(204);
    const { projectId: _project, mine: _mine, ...body } = before as Comment;
    expect((await call("POST", path(), { cookie: ben.cookie, body })).status).toBe(201);
    expect((await list(ben))[0]).toMatchObject({ editedAt: before?.editedAt, mine: true });
  });

  it("refuses a client's comment once the review link no longer has it, creating nothing", async () => {
    expect((await post(owner, "guest-1", { fromShare: true })).status).toBe(201);
    expect((await remove(owner, "guest-1")).status).toBe(204);
    await createPostgresStore(db).deleteComments(shareId, ["guest-1"]);
    expect((await post(owner, "guest-1", { fromShare: true })).status).toBe(404);
    const { rows } = await db.query("SELECT 1 FROM comments WHERE id = 'guest-1'");
    expect(rows).toEqual([]);
  });
});
