import { afterEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { connectedWorkspace, type Intercept } from "@/test/workspace-client";
import { PNG, URL_PROJECT, type Seat } from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { deleteFolder, listFolders } from "../workspace/folders";
import { addComment } from "../workspace/comments";
import { ARCHIVE_GRACE_MS } from "../workspace/limits";
import {
  createProject,
  getProject,
  listProjects,
  restoreProject,
  trashProject,
} from "../workspace/projects";
import type { WorkspaceData, WorkspaceStart } from "../workspace/types";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

/** Answers instead of the server while set: a refusal, or a request that never arrives. */
let intercept: Intercept | null = null;

afterEach(() => {
  intercept = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** The workspace as the server renders a page of it now, for `owner`. */
async function render(owner: Seat): Promise<WorkspaceStart> {
  const response = await call("GET", `/api/w/${owner.workspaceId}/snapshot`, {
    cookie: owner.cookie,
  });
  return { data: (await response.json()) as WorkspaceData, links: [] };
}

/** A connected store; requests go through `intercept` while it's set. */
const connected = (setUp?: (db: Database, workspaceId: string) => Promise<void>) =>
  connectedWorkspace(holder, { setUp, intercept: () => intercept });

describe("the workspace store", () => {
  it("shows a change at once and saves it to the server in order", async () => {
    const { db, owner, store, actions, data } = await connected();
    const folder = actions.createFolder("Clients", "f1");
    if (!folder.ok) throw new Error(folder.error);
    const project = actions.createProject({
      folderId: folder.value.id,
      name: "Homepage",
      source: { kind: "url", url: "https://acme.example/" },
    });
    if (!project.ok) throw new Error(project.error);
    expect(data().projects.map((entry) => entry.name)).toEqual(["Homepage"]);

    await store.whenSaved();
    const saved = await listProjects(db, owner.workspaceId);
    expect(saved.map(({ id, folderId }) => ({ id, folderId }))).toEqual([
      { id: project.value.id, folderId: folder.value.id },
    ]);
  });

  it("rolls back a change to something deleted in another tab, and says so", async () => {
    const { db, owner, store, actions, notices, data } = await connected(async (db, id) => {
      await createProject(db, id, URL_PROJECT("p1"), 1);
    });
    await trashProject(db, owner.workspaceId, "p1", 2);

    expect(actions.renameProject("p1", "Renamed").ok).toBe(true);
    expect(data().projects[0]?.name).toBe("Renamed");
    await store.whenSaved();
    await store.refreshWorkspace();

    expect(notices).toEqual([
      "This project is no longer here. It may have been deleted in another tab.",
    ]);
    expect(data().projects).toEqual([]);
  });

  it("rolls back a change the server never got, and asks to try again", async () => {
    const { store, actions, notices, data } = await connected();
    intercept = () => Promise.reject(new TypeError("offline"));
    actions.renameFolder("f1", "Offline");
    expect(data().folders[0]?.name).toBe("Offline");
    await store.whenSaved();
    intercept = null;

    expect(data().folders[0]?.name).toBe("f1");
    expect(notices).toEqual([
      "That change didn't save and was undone. Check your connection and try again.",
    ]);
  });

  it("never lets a read from the server undo a change still being saved", async () => {
    const { db, owner, store, actions, data } = await connected();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    intercept = (request) =>
      request.method === "PATCH" ? held.then(() => new Response(null, { status: 503 })) : null;
    actions.renameFolder("f1", "Mine");
    await store.refreshWorkspace();
    expect(data().folders[0]?.name).toBe("Mine");

    intercept = null;
    release();
    await store.whenSaved();
    await store.refreshWorkspace();
    // The held request failed: the server's name is back, and nothing else was lost.
    expect(data().folders[0]?.name).toBe("f1");
    expect((await listFolders(db, owner.workspaceId))[0]?.name).toBe("f1");
  });

  it("shows another tab's changes on the next read", async () => {
    const { db, owner, store, data } = await connected();
    await createProject(db, owner.workspaceId, URL_PROJECT("p9"), 1);
    await store.refreshWorkspace();
    expect(data().projects.map((project) => project.id)).toEqual(["p9"]);
  });

  it("files a restored project whose folder is gone into a new folder", async () => {
    const { db, owner, store, data } = await connected(async (db, id) => {
      await createProject(db, id, URL_PROJECT("p1"), 1);
      await trashProject(db, id, "p1", 2);
      await deleteFolder(db, id, "f1");
      await restoreProject(db, id, "p1");
    });
    const [folder] = data().folders;
    expect(folder?.name).toBe("Restored projects");
    expect(data().projects[0]?.folderId).toBe(folder?.id);

    await store.whenSaved();
    expect((await listProjects(db, owner.workspaceId))[0]?.folderId).toBe(folder?.id);
  });

  it("files the same way in two tabs at once, making one folder", async () => {
    const { db, owner, store, notices, start } = await connected(async (db, id) => {
      await createProject(db, id, URL_PROJECT("p1"), 1);
      await trashProject(db, id, "p1", 2);
      await deleteFolder(db, id, "f1");
      await restoreProject(db, id, "p1");
    });
    // A second tab, on the same server render, files too before the first one's saves land.
    vi.resetModules();
    const other = await import("./workspace-store");
    const otherNotices: string[] = [];
    other.subscribeNotices((message) => otherNotices.push(message));
    other.connectWorkspace(start);
    await Promise.all([store.whenSaved(), other.whenSaved()]);

    expect((await listFolders(db, owner.workspaceId)).map((folder) => folder.name)).toEqual([
      "Restored projects",
    ]);
    expect([...notices, ...otherNotices]).toEqual([]);
  });

  it("uploads a file once its project is saved, and reads it back by its logical key", async () => {
    const { store, actions } = await connected();
    const project = actions.createProject({
      folderId: "f1",
      name: "Shot",
      source: { kind: "url", url: "https://acme.example/" },
    });
    if (!project.ok) throw new Error(project.error);
    const { storeWorkspaceBlob } = await import("./blob-upload");
    const blob = new Blob([PNG], { type: "image/png" });
    expect(await storeWorkspaceBlob(project.value.id, "snapshot:s1", blob)).toEqual({ ok: true });
    actions.addSnapshot({
      id: "s1",
      projectId: project.value.id,
      width: 800,
      height: 600,
      blobKey: "snapshot:s1",
      sourceUrl: "https://acme.example/",
    });
    await store.whenSaved();

    // A fresh tab has nothing held: the image comes from the server.
    vi.resetModules();
    const fresh = await import("./workspace-store");
    const snapshot = await fetch(`/api/w/${store.connectedWorkspaceId() ?? ""}/snapshot`);
    fresh.connectWorkspace({ data: (await snapshot.json()) as WorkspaceData, links: [] });
    const read = await fresh.workspaceBlobs()?.get("snapshot:s1");
    expect(new Uint8Array((await read?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(PNG);
    expect(await fresh.workspaceBlobs()?.get("snapshot:unknown")).toBeNull();
  });

  it("keeps live-frame pins on the screenshot's page after a refresh", async () => {
    const { store, actions, data } = await connected(async (db, id) => {
      await createProject(db, id, URL_PROJECT("p1"), 1);
      const pin = { x: 12, y: 40, body: "Hero", author: "Ana", status: "active" as const };
      await addComment(db, id, "p1", { id: "frame", ...pin }, null, 1);
    });
    const image = { blob: new Blob([PNG], { type: "image/png" }), fileName: "shot.png" };
    const replaced = await actions.replaceWithImage(
      "p1",
      { ...image, width: 800, height: 600 },
      { referenceUrl: "https://acme.example/", pageId: null },
    );
    expect(replaced.ok).toBe(true);
    const project = data().projects[0];
    const page = project?.source.kind === "pages" ? project.source.pages[0] : undefined;
    expect(data().comments[0]).toMatchObject({ pageId: page?.id, x: 12, y: 40 });

    await store.refreshWorkspace();
    expect(data().comments[0]).toMatchObject({ pageId: page?.id, x: 12, y: 40 });
  });

  it("archives at once with its deletion date, saves it, and unarchives the same way", async () => {
    const { db, owner, store, actions, data } = await connected(async (db, id) => {
      await createProject(db, id, URL_PROJECT("p1"), 1);
    });
    const before = Date.now();
    expect(actions.setProjectArchived("p1", true).ok).toBe(true);
    const archived = data().projects[0];
    expect(archived?.archivedAt).toBeGreaterThanOrEqual(before);
    expect(archived?.deleteAfter).toBe((archived?.archivedAt ?? 0) + ARCHIVE_GRACE_MS);
    await store.whenSaved();
    const saved = await getProject(db, owner.workspaceId, "p1");
    expect(saved?.archivedAt).not.toBeNull();
    expect(saved?.deleteAfter).toBe((saved?.archivedAt ?? 0) + ARCHIVE_GRACE_MS);

    // The server's dates come back on the next read.
    await store.refreshWorkspace();
    expect(data().projects[0]).toMatchObject({
      archivedAt: saved?.archivedAt,
      deleteAfter: saved?.deleteAfter,
    });

    expect(actions.setProjectArchived("p1", false).ok).toBe(true);
    expect(data().projects[0]).not.toHaveProperty("archivedAt");
    expect(data().projects[0]).not.toHaveProperty("deleteAfter");
    await store.whenSaved();
    expect(await getProject(db, owner.workspaceId, "p1")).toMatchObject({
      archivedAt: null,
      deleteAfter: null,
    });
  });

  it("sets a cleaned-up label, saves it, and clears it", async () => {
    const { db, owner, store, actions, data } = await connected(async (db, id) => {
      await createProject(db, id, URL_PROJECT("p1"), 1);
    });
    actions.setProjectLabel("p1", "  Client   review ");
    expect(data().projects[0]?.label).toBe("Client review");
    await store.whenSaved();
    expect((await getProject(db, owner.workspaceId, "p1"))?.label).toBe("Client review");

    actions.setProjectLabel("p1", null);
    expect(data().projects[0]).not.toHaveProperty("label");
    await store.whenSaved();
    expect((await getProject(db, owner.workspaceId, "p1"))?.label).toBeNull();
  });

  it("rolls back an archive the server refused, and says so", async () => {
    const { db, owner, store, actions, notices, data } = await connected(async (db, id) => {
      await createProject(db, id, URL_PROJECT("p1"), 1);
    });
    await trashProject(db, owner.workspaceId, "p1", 2);
    actions.setProjectArchived("p1", true);
    expect(data().projects[0]?.archivedAt).toBeDefined();
    await store.whenSaved();
    await store.refreshWorkspace();
    expect(notices).toEqual([
      "This project is no longer here. It may have been deleted in another tab.",
    ]);
    expect(data().projects).toEqual([]);
  });

  it("shows the signed-out state once the session is gone, and the workspace once back", async () => {
    const { db, owner, store, actions, data } = await connected();
    const { rows } = await db.query<Record<string, unknown>>("SELECT * FROM sessions");
    await db.query("DELETE FROM sessions");
    actions.renameFolder("f1", "Late");
    await store.whenSaved();
    expect(store.getWorkspaceState()).toEqual({ status: "error", reason: "signed-out" });

    // Signed in again (the session is back) and the page renders the workspace anew.
    const [session] = rows;
    await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
      session?.token_hash,
      session?.user_id,
      session?.expires_at,
    ]);
    store.connectWorkspace(await render(owner));
    expect(store.getWorkspaceState().status).toBe("ready");
    expect(data().folders[0]?.name).toBe("f1");
  });

  it("recovers from the signed-out state on a read that works", async () => {
    const { store } = await connected();
    intercept = (request) =>
      request.url.endsWith("/snapshot")
        ? Promise.resolve(Response.json({ error: "unauthenticated" }, { status: 401 }))
        : null;
    await store.refreshWorkspace();
    expect(store.getWorkspaceState()).toEqual({ status: "error", reason: "signed-out" });
    intercept = null;
    await store.refreshWorkspace();
    expect(store.getWorkspaceState().status).toBe("ready");
  });

  it("moves on to a newer server render without reading the workspace again", async () => {
    const { db, owner, store, data } = await connected();
    await createProject(db, owner.workspaceId, URL_PROJECT("p9"), 1);
    const next = await render(owner);
    const reads: string[] = [];
    intercept = (request) => {
      reads.push(new URL(request.url).pathname);
      return null;
    };
    store.connectWorkspace(next);
    expect(data().projects.map((project) => project.id)).toEqual(["p9"]);
    expect(store.getWorkspaceState()).toBe(store.startState(next));
    await store.whenSaved();
    expect(reads).toEqual([]);
  });

  it("never lets an older server render undo this tab's changes", async () => {
    const { owner, store, actions, data, start } = await connected();
    const before = await render(owner);
    actions.renameFolder("f1", "Mine");
    // A render from before the rename, handed in while it's being saved, and one shown already.
    store.connectWorkspace(before);
    store.connectWorkspace(start);
    expect(data().folders[0]?.name).toBe("Mine");
    await store.whenSaved();
    await store.refreshWorkspace();
    expect(data().folders[0]?.name).toBe("Mine");
  });
});
