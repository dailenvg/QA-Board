import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import type { ShareStore } from "../share/store";
import { createProject } from "./projects";
import { attachShare } from "./share-links";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let db: Database;
let a: Seat;
let store: ShareStore;
let shareId: string;

/** Project p1 of workspace A, shared, with a guest's comment and the owner's own on its link. */
beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  ({ db, a } = await twoWorkspaces());
  holder.db = db;
  await addFolder(db, a.workspaceId);
  for (const id of ["p1", "p2"]) await createProject(db, a.workspaceId, URL_PROJECT(id), NOW);
  store = createPostgresStore(db);
  const created = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
  shareId = created.shareId;
  const { token, ownerKey } = created;
  await db.transaction((tx) =>
    attachShare(tx, a.workspaceId, "p1", { shareId, token, ownerKey }, NOW, TEST_AUTH_SECRET),
  );
  const item = (id: string) => ({
    id,
    x: 1,
    y: 1,
    body: "Hi",
    author: "Cleo",
    status: "active" as const,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await store.insertComment(shareId, item("guest-1"), "client");
  await store.insertComment(shareId, item("owners-own"), "owner");
});

function post(projectId: string, id: string, fromShare?: true) {
  return call("POST", `/api/w/${a.workspaceId}/projects/${projectId}/comments`, {
    cookie: a.cookie,
    body: { id, x: 1, y: 1, body: "Hi", author: "Cleo", ...(fromShare ? { fromShare } : {}) },
  });
}

async function authorOf(id: string): Promise<string | null | undefined> {
  const { rows } = await db.query<{ author_user_id: string | null }>(
    "SELECT author_user_id FROM comments WHERE id = $1",
    [id],
  );
  return rows[0]?.author_user_id;
}

async function originOf(id: string): Promise<string | undefined> {
  const { rows } = await db.query<{ origin: string }>("SELECT origin FROM comments WHERE id = $1", [
    id,
  ]);
  return rows[0]?.origin;
}

describe("saving a guest's comment pulled from a review link", () => {
  it("stores it without an author account, as a client's", async () => {
    expect((await post("p1", "guest-1", true)).status).toBe(201);
    expect(await authorOf("guest-1")).toBeNull();
    expect(await originOf("guest-1")).toBe("client");
  });

  it("keeps a member's own comment theirs, the team's", async () => {
    expect((await post("p1", "mine")).status).toBe(201);
    expect(await authorOf("mine")).toBe(a.userId);
    expect(await originOf("mine")).toBe("team");
  });

  it("takes it back as a client's after a delete is undone, while the link still has it", async () => {
    expect((await post("p1", "guest-1", true)).status).toBe(201);
    const path = `/api/w/${a.workspaceId}/projects/p1/comments/guest-1`;
    expect((await call("DELETE", path, { cookie: a.cookie })).status).toBe(204);
    expect((await post("p1", "guest-1", true)).status).toBe(201);
    expect(await originOf("guest-1")).toBe("client");
  });

  it("refuses anything a guest didn't post on that project's link", async () => {
    // Not on the link, the owner's own copy on it, and a guest's from another project's link.
    expect((await post("p1", "made-up", true)).status).toBe(404);
    expect((await post("p1", "owners-own", true)).status).toBe(404);
    expect((await post("p2", "guest-1", true)).status).toBe(404);
    for (const id of ["made-up", "owners-own"]) expect(await authorOf(id)).toBeUndefined();
  });

  it("only takes `true`", async () => {
    const response = await call("POST", `/api/w/${a.workspaceId}/projects/p1/comments`, {
      cookie: a.cookie,
      body: { id: "x", x: 1, y: 1, body: "Hi", author: "Cleo", fromShare: "yes" },
    });
    expect(response.status).toBe(400);
  });
});
