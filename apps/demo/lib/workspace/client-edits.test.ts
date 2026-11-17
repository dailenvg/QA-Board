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
import type { ShareServices } from "../share/server";
import { addClientComment, createShare, editClientComment, ownerShare } from "../share/service";
import type { ShareRecord } from "../share/types";
import { createProject } from "./projects";
import { attachShare } from "./share-links";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let db: Database;
let a: Seat;
let services: ShareServices;
let share: ShareRecord;
/** The edit key of the guest's comment `guest-1`. */
let key: string;

/** Project p1 of workspace A, shared, with a guest's comment on its link (posted at NOW). */
beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  ({ db, a } = await twoWorkspaces());
  holder.db = db;
  await addFolder(db, a.workspaceId);
  for (const id of ["p1", "p2"]) await createProject(db, a.workspaceId, URL_PROJECT(id), NOW);
  services = { store: createPostgresStore(db), blobs: inlineBackend };
  const created = await createShare(services, STATE, NOW);
  const { shareId, token, ownerKey } = created;
  await db.transaction((tx) =>
    attachShare(tx, a.workspaceId, "p1", { shareId, token, ownerKey }, NOW, TEST_AUTH_SECRET),
  );
  const found = await ownerShare(services.store, shareId, ownerKey, NOW);
  if (!found) throw new Error("no share");
  share = found;
  const comment = { id: "guest-1", x: 10, y: 20, body: "Logo is small", author: "Cleo" };
  const added = await addClientComment(services, share, comment, null, NOW);
  if (!added.ok) throw new Error(added.error);
  key = added.value.editKey;
});

const comments = () => `/api/w/${a.workspaceId}/projects/p1/comments`;

/** Saves `guest-1` as the owner's browser does after a pull, with what `sent` claims it says. */
function pull(sent: Record<string, unknown> = {}) {
  return call("POST", comments(), {
    cookie: a.cookie,
    body: {
      id: "guest-1",
      x: 10,
      y: 20,
      body: "Logo is small",
      author: "Cleo",
      ...sent,
      fromShare: true,
    },
  });
}

function clientEdit(id = "guest-1", projectId = "p1") {
  return call("POST", `/api/w/${a.workspaceId}/projects/${projectId}/comments/${id}/client-edit`, {
    cookie: a.cookie,
    body: {},
  });
}

function setStatus(status: "active" | "resolved", id = "guest-1") {
  return call("PATCH", `${comments()}/${id}`, { cookie: a.cookie, body: { status } });
}

async function saved(id = "guest-1") {
  const { rows } = await db.query<{ body: string; edited_at: Date | null; author_name: string }>(
    "SELECT body, edited_at, author_name FROM comments WHERE id = $1",
    [id],
  );
  return rows[0];
}

async function onLink(id = "guest-1") {
  return (await services.store.comments(share.id)).find((row) => row.item.id === id)?.item;
}

describe("a guest's comment pulled into the workspace", () => {
  it("is saved with the link's words, name, position and edit time, whatever the browser says", async () => {
    await editClientComment(services, share, "guest-1", key, "Logo is too small", NOW + 1_000);
    const response = await pull({ body: "Planted words", author: "Ana", x: 90, y: 90 });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: "guest-1",
      body: "Logo is too small",
      author: "Cleo",
      x: 10,
      y: 20,
      editedAt: NOW + 1_000,
      fromClient: true,
    });
  });

  it("is brought back by Undo with its latest words", async () => {
    expect((await pull()).status).toBe(201);
    expect((await call("DELETE", `${comments()}/guest-1`, { cookie: a.cookie })).status).toBe(204);
    await editClientComment(services, share, "guest-1", key, "Edited after", NOW + 2_000);
    expect((await pull()).status).toBe(201);
    expect(await saved()).toMatchObject({ body: "Edited after" });
  });
});

describe("POST .../comments/:id/client-edit", () => {
  it("copies the client's latest edit from the link, and says when", async () => {
    expect((await pull()).status).toBe(201);
    await editClientComment(services, share, "guest-1", key, "Logo is too small", NOW + 1_000);
    const response = await clientEdit();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "guest-1",
      body: "Logo is too small",
      editedAt: NOW + 1_000,
      fromClient: true,
    });
    // Again (another tab, a repeated pull): nothing changes.
    expect(await (await clientEdit()).json()).toMatchObject({ body: "Logo is too small" });
    expect(await saved()).toMatchObject({ body: "Logo is too small", author_name: "Cleo" });
  });

  it("never replaces newer words with older ones", async () => {
    expect((await pull()).status).toBe(201);
    await editClientComment(services, share, "guest-1", key, "Older", NOW + 1_000);
    await db.query("UPDATE comments SET body = 'Newer', edited_at = $1 WHERE id = 'guest-1'", [
      new Date(NOW + 5_000),
    ]);
    expect(await (await clientEdit()).json()).toMatchObject({ body: "Newer" });
  });

  it("never adds a comment: one deleted here, never saved, or on another project is a 404", async () => {
    await editClientComment(services, share, "guest-1", key, "Edited", NOW + 1_000);
    // Never pulled into the workspace.
    expect((await clientEdit()).status).toBe(404);
    expect(await saved()).toBeUndefined();
    // Pulled, then deleted by the team.
    expect((await pull()).status).toBe(201);
    expect((await call("DELETE", `${comments()}/guest-1`, { cookie: a.cookie })).status).toBe(204);
    expect((await clientEdit()).status).toBe(404);
    expect(await saved()).toBeUndefined();
    // Another project has no such guest comment on its link.
    expect((await clientEdit("guest-1", "p2")).status).toBe(404);
  });

  it("refuses the team's own comments", async () => {
    const posted = await call("POST", comments(), {
      cookie: a.cookie,
      body: { id: "team-1", x: 1, y: 1, body: "Ours", author: "Ana" },
    });
    expect(posted.status).toBe(201);
    expect((await clientEdit("team-1")).status).toBe(404);
    expect(await saved("team-1")).toMatchObject({ body: "Ours", edited_at: null });
  });
});

describe("resolving a client's comment in the workspace", () => {
  it("locks it on the link at once, and reopening unlocks it", async () => {
    expect((await pull()).status).toBe(201);
    expect((await setStatus("resolved")).status).toBe(200);
    const locked = await onLink();
    expect(locked?.status).toBe("resolved");
    expect(locked?.resolvedAt).toBeGreaterThan(0);
    expect(await editClientComment(services, share, "guest-1", key, "Late", NOW + 1_000)).toEqual({
      ok: false,
      status: 409,
      error: "locked",
    });

    expect((await setStatus("active")).status).toBe(200);
    expect(await onLink()).toMatchObject({ status: "active" });
    expect(await onLink()).not.toHaveProperty("resolvedAt");
    expect(
      await editClientComment(services, share, "guest-1", key, "Now", NOW + 2_000),
    ).toMatchObject({ ok: true });
  });

  it("leaves the link alone for a team comment, and a project without a link", async () => {
    const posted = await call("POST", comments(), {
      cookie: a.cookie,
      body: { id: "c-1", x: 1, y: 1, body: "Ours", author: "Ana" },
    });
    expect(posted.status).toBe(201);
    const before = await onLink("c-1");
    expect((await setStatus("resolved", "c-1")).status).toBe(200);
    expect(await onLink("c-1")).toEqual(before);
  });
});
