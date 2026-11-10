import { describe, expect, it } from "vitest";
import { STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  PNG,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
} from "@/test/workspace-fixture";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import { listComments } from "./comments";
import { listFolders } from "./folders";
import { importData } from "./import-data";
import { createProject, listProjects, trashProject } from "./projects";
import type { ImportData } from "./schemas";
import { importSchema } from "./schemas";
import { getShareLink } from "./share-links";
import { listSnapshots } from "./snapshots";
import { storeInline } from "./uploads";

/** A browser's local data: nested folders, a website with a snapshot, a page project. */
function browserData(overrides: Partial<ImportData> = {}): ImportData {
  return importSchema.parse({
    folders: [
      // A child listed before its parent.
      { id: "child", name: "Child", createdAt: NOW, parentId: "default" },
      { id: "default", name: "My projects", createdAt: NOW - 10, parentId: null },
      { id: "orphan", name: "Orphan", createdAt: NOW, parentId: "gone" },
      { id: "loop-a", name: "A", createdAt: NOW, parentId: "loop-b" },
      { id: "loop-b", name: "B", createdAt: NOW, parentId: "loop-a" },
    ],
    projects: [
      {
        id: "web",
        folderId: "default",
        name: "Website",
        source: { kind: "url", url: "https://acme.example/" },
        createdAt: NOW - 5,
        updatedAt: NOW - 1,
      },
      {
        id: "deck",
        folderId: "child",
        name: "Deck",
        source: {
          kind: "pages",
          origin: "pdf",
          fileName: "deck.pdf",
          pages: [
            { id: "page-1", blobKey: "image:deck", name: "Page 1" },
            { id: "p2", blobKey: "page:p2", name: "Page 2", width: 100, height: 200 },
          ],
        },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    snapshots: [
      {
        id: "s1",
        projectId: "web",
        width: 1280,
        height: 3000,
        createdAt: NOW,
        blobKey: "snapshot:s1",
        sourceUrl: "https://acme.example/",
      },
    ],
    comments: [
      {
        id: "c1",
        projectId: "web",
        x: 1,
        y: 2,
        body: "Mine",
        author: "Dailen",
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
        snapshotId: "s1",
        crop: { blobKey: "crop:c1", rect: { x: 0, y: 0, width: 10, height: 10 } },
      },
      {
        id: "c2",
        projectId: "deck",
        x: 3,
        y: 4,
        body: "A guest's",
        author: "Client",
        status: "resolved",
        createdAt: NOW,
        updatedAt: NOW + 1,
        resolvedAt: NOW + 1,
        pageId: "p2",
      },
      {
        id: "c3",
        projectId: "deck",
        x: 3,
        y: 4,
        body: "On a page that's gone",
        author: "Dailen",
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
        pageId: "missing",
      },
    ],
    authorName: "Dailen",
    ...overrides,
  });
}

describe("import", () => {
  it("imports everything in one go, parents first, keeping ids and times", async () => {
    const { db, a } = await twoWorkspaces();
    const result = await importData(
      db,
      a.workspaceId,
      a.userId,
      browserData(),
      NOW,
      TEST_AUTH_SECRET,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        imported: { folders: 5, projects: 2, snapshots: 1, comments: 2, shares: 0 },
        skipped: { folders: 0, projects: 0, snapshots: 0, comments: 1, shares: 0 },
        projects: { imported: ["web", "deck"], existing: [], trashed: [], unlinked: [] },
        uploads: [
          { projectId: "deck", key: "image:deck" },
          { projectId: "deck", key: "page:p2" },
          { projectId: "web", key: "snapshot:s1" },
          { projectId: "web", key: "crop:c1" },
        ],
      },
    });
    const folders = Object.fromEntries(
      (await listFolders(db, a.workspaceId)).map((folder) => [folder.id, folder.parentId]),
    );
    expect(folders).toEqual({
      default: null,
      child: "default",
      orphan: null,
      // A loop is broken at its first folder.
      "loop-a": null,
      "loop-b": "loop-a",
    });
    const projects = await listProjects(db, a.workspaceId);
    expect(projects.find((project) => project.id === "web")).toMatchObject({
      createdAt: NOW - 5,
      updatedAt: NOW - 1,
    });
    expect(await listSnapshots(db, a.workspaceId, "web")).toHaveLength(1);
    const comments = await listComments(db, a.workspaceId);
    expect(comments.map((comment) => comment.id)).toEqual(["c1", "c2"]);
    expect(comments[1]).toMatchObject({
      status: "resolved",
      resolvedAt: NOW + 1,
      updatedAt: NOW + 1,
    });
    // The browser's own comments become the member's; pulled guest comments keep no user.
    const { rows } = await db.query<{ id: string; author_user_id: string | null; origin: string }>(
      "SELECT id, author_user_id, origin FROM comments ORDER BY id",
    );
    expect(rows).toEqual([
      { id: "c1", author_user_id: a.userId, origin: "team" },
      { id: "c2", author_user_id: null, origin: "client" },
    ]);
  });

  it("imports a comment pulled from a review link as a client's, whatever its author's name", async () => {
    const { db, a } = await twoWorkspaces();
    const data = browserData();
    const pulled = data.comments.map((comment) =>
      comment.id === "c1" ? { ...comment, fromClient: true as const } : comment,
    );
    await importData(
      db,
      a.workspaceId,
      a.userId,
      { ...data, comments: pulled },
      NOW,
      TEST_AUTH_SECRET,
    );
    const { rows } = await db.query<{ id: string; origin: string }>(
      "SELECT id, origin FROM comments ORDER BY id",
    );
    // c1's author has the browser's own name, but it came from a client.
    expect(rows).toEqual([
      { id: "c1", origin: "client" },
      { id: "c2", origin: "client" },
    ]);
    expect((await listComments(db, a.workspaceId)).every((comment) => comment.fromClient)).toBe(
      true,
    );
  });

  it("is idempotent: a second import skips everything and changes nothing", async () => {
    const { db, a } = await twoWorkspaces();
    await importData(db, a.workspaceId, a.userId, browserData(), NOW, TEST_AUTH_SECRET);
    await db.query("UPDATE comments SET body = 'Edited on the server' WHERE id = 'c1'");
    const again = await importData(
      db,
      a.workspaceId,
      a.userId,
      browserData(),
      NOW,
      TEST_AUTH_SECRET,
    );
    expect(again.ok && again.value).toMatchObject({
      imported: { folders: 0, projects: 0, snapshots: 0, comments: 0, shares: 0 },
      skipped: { folders: 5, projects: 2, snapshots: 1, comments: 3, shares: 0 },
      projects: { imported: [], existing: ["web", "deck"], trashed: [], unlinked: [] },
    });
    const comments = await listComments(db, a.workspaceId);
    expect(comments.find((comment) => comment.id === "c1")?.body).toBe("Edited on the server");
  });

  it("lists again the files an earlier import's uploads never delivered, and only those", async () => {
    const { db, a } = await twoWorkspaces();
    await importData(db, a.workspaceId, a.userId, browserData(), NOW, TEST_AUTH_SECRET);
    await storeInline(db, a.workspaceId, { projectId: "deck", key: "image:deck" }, PNG);
    await storeInline(db, a.workspaceId, { projectId: "web", key: "crop:c1" }, PNG);
    const again = await importData(
      db,
      a.workspaceId,
      a.userId,
      browserData(),
      NOW,
      TEST_AUTH_SECRET,
    );
    expect(again.ok && again.value.uploads).toEqual([
      { projectId: "deck", key: "page:p2" },
      { projectId: "web", key: "snapshot:s1" },
    ]);
  });

  it("says which projects are in the trash, and lists no files for them", async () => {
    const { db, a } = await twoWorkspaces();
    await importData(db, a.workspaceId, a.userId, browserData(), NOW, TEST_AUTH_SECRET);
    await trashProject(db, a.workspaceId, "deck", NOW);
    const again = await importData(
      db,
      a.workspaceId,
      a.userId,
      browserData(),
      NOW,
      TEST_AUTH_SECRET,
    );
    expect(again.ok && again.value.projects).toMatchObject({
      existing: ["web"],
      trashed: ["deck"],
    });
    expect(again.ok && again.value.uploads.map((upload) => upload.projectId)).toEqual([
      "web",
      "web",
    ]);
  });

  it("refuses the whole import (409) when a project id is another workspace's, writing nothing", async () => {
    const { db, a, b } = await twoWorkspaces();
    await addFolder(db, b.workspaceId);
    await createProject(db, b.workspaceId, URL_PROJECT("deck"), NOW);
    const result = await importData(
      db,
      a.workspaceId,
      a.userId,
      browserData(),
      NOW,
      TEST_AUTH_SECRET,
    );
    expect(result).toEqual({ ok: false, reason: "exists" });
    expect(await listFolders(db, a.workspaceId)).toEqual([]);
    expect(await listProjects(db, a.workspaceId)).toEqual([]);
    expect((await listProjects(db, b.workspaceId)).map((project) => project.name)).toEqual([
      "Project deck",
    ]);
  });

  it("skips a project whose folder isn't there, with its children", async () => {
    const { db, a } = await twoWorkspaces();
    const data = browserData({ folders: [] });
    const result = await importData(db, a.workspaceId, a.userId, data, NOW, TEST_AUTH_SECRET);
    expect(result.ok && result.value.imported).toEqual({
      folders: 0,
      projects: 0,
      snapshots: 0,
      comments: 0,
      shares: 0,
    });
    expect(result.ok && result.value.projects).toEqual({
      imported: [],
      existing: [],
      trashed: [],
      unlinked: [],
    });
    expect(result.ok && result.value.uploads).toEqual([]);
  });

  it("attaches a share it can prove, and skips one it can't", async () => {
    const { db, a } = await twoWorkspaces();
    const store = createPostgresStore(db);
    const good = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
    const forged = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
    const share = (created: typeof good, ownerKey = created.ownerKey) => ({
      id: created.shareId,
      token: created.token,
      ownerKey,
      createdAt: NOW,
      cursor: 2,
    });
    const base = browserData();
    const [web, deck] = base.projects;
    if (!web || !deck) throw new Error("fixture");
    const data = {
      ...base,
      projects: [
        { ...web, share: share(good) },
        { ...deck, share: share(forged, "f".repeat(43)) },
      ],
    };
    const result = await importData(db, a.workspaceId, a.userId, data, NOW, TEST_AUTH_SECRET);
    expect(result.ok && [result.value.imported.shares, result.value.skipped.shares]).toEqual([
      1, 1,
    ]);
    expect(result.ok && result.value.projects.unlinked).toEqual(["deck"]);
    expect(await getShareLink(db, a.workspaceId, "web", TEST_AUTH_SECRET)).toMatchObject({
      id: good.shareId,
      token: good.token,
      cursor: 2,
    });
    expect(await getShareLink(db, a.workspaceId, "deck", TEST_AUTH_SECRET)).toBeNull();
    // The proven share stops its 30-day countdown; the forged one keeps it.
    expect((await store.byId(good.shareId))?.expiresAt).toBeNull();
    expect((await store.byId(forged.shareId))?.expiresAt).toBe(forged.expiresAt);
  });
});
