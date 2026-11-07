import { afterEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { connectedWorkspace, type Intercept } from "@/test/workspace-client";
import { PNG, URL_PROJECT } from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { deleteFolder, listFolders } from "../workspace/folders";
import { createProject, listProjects, restoreProject, trashProject } from "../workspace/projects";
import type { WorkspaceData } from "../workspace/types";

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
      "Your change couldn't be saved. Check your connection and try again.",
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

  it("shows the signed-out state once the session is gone", async () => {
    const { db, store, actions } = await connected();
    await db.query("DELETE FROM sessions");
    actions.renameFolder("f1", "Late");
    await store.whenSaved();
    expect(store.getWorkspaceState()).toEqual({ status: "error", reason: "signed-out" });
  });
});
