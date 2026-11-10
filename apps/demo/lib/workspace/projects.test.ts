import { describe, expect, it } from "vitest";
import {
  addFolder,
  NOW,
  PAGES_PROJECT,
  twoWorkspaces,
  URL_PROJECT,
} from "@/test/workspace-fixture";
import {
  createProject,
  getProject,
  listProjects,
  listTrash,
  restoreProject,
  setArchived,
  setLabel,
  trashProject,
  updateProject,
} from "./projects";
import { addComment, listComments } from "./comments";
import { ARCHIVE_GRACE_MS } from "./limits";

describe("projects", () => {
  it("creates a page project with its pages, in order, and reads it back as the browser's shape", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    const created = await createProject(
      db,
      a.workspaceId,
      { ...PAGES_PROJECT("p1"), createdAt: NOW },
      NOW,
    );
    expect(created).toEqual({
      ok: true,
      value: {
        id: "p1",
        folderId: "f1",
        name: "Pages p1",
        source: {
          kind: "pages",
          origin: "image",
          fileName: "home.png",
          pages: [
            { id: "page-1", blobKey: "page:page-1", name: "Home", width: 1440, height: 3000 },
            { id: "page-2", blobKey: "page:page-2", name: "About" },
          ],
        },
        createdAt: NOW,
        updatedAt: NOW,
        label: null,
        archivedAt: null,
        deleteAfter: null,
      },
    });
    const { rows } = await db.query<{ source: unknown }>("SELECT source FROM projects");
    // The pages live in their table only.
    expect(rows[0]?.source).toEqual({ kind: "pages", origin: "image", fileName: "home.png" });
  });

  it("refuses a taken id (anywhere) and an unknown folder", async () => {
    const { db, a, b } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await addFolder(db, b.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
    expect(await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW)).toEqual({
      ok: false,
      reason: "exists",
    });
    expect(await createProject(db, b.workspaceId, URL_PROJECT("p1"), NOW)).toEqual({
      ok: false,
      reason: "exists",
    });
    expect(await createProject(db, a.workspaceId, URL_PROJECT("p2", "nope"), NOW)).toEqual({
      ok: false,
      reason: "unknown-folder",
    });
  });

  it("renames, moves, and replaces a website with a screenshot's pages", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId, "f1");
    await addFolder(db, a.workspaceId, "f2");
    await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
    const source = {
      kind: "pages" as const,
      origin: "image" as const,
      fileName: "shot.png",
      referenceUrl: "https://acme.example/",
      pages: [{ id: "page-9", blobKey: "page:page-9", name: "Shot" }],
    };
    const updated = await updateProject(
      db,
      a.workspaceId,
      "p1",
      { name: "Renamed", folderId: "f2", source },
      NOW + 5,
    );
    expect(updated.ok && updated.value).toMatchObject({
      name: "Renamed",
      folderId: "f2",
      source,
      updatedAt: NOW + 5,
    });
    expect(await updateProject(db, a.workspaceId, "p1", { folderId: "nope" }, NOW)).toEqual({
      ok: false,
      reason: "unknown-folder",
    });
    expect(await updateProject(db, a.workspaceId, "nope", { name: "X" }, NOW)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("moves a website's live-frame pins onto the screenshot's page, where they were", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId, "f1");
    await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
    const pin = { x: 12, y: 40, body: "Hero", author: "Ana", status: "active" as const };
    await addComment(db, a.workspaceId, "p1", { id: "frame", ...pin }, null, NOW);
    const source = {
      kind: "pages" as const,
      origin: "image" as const,
      fileName: "shot.png",
      pages: [{ id: "page-9", blobKey: "page:page-9", name: "Shot" }],
    };
    await updateProject(db, a.workspaceId, "p1", { source }, NOW + 1);
    expect(await listComments(db, a.workspaceId, "p1")).toMatchObject([
      { id: "frame", pageId: "page-9", x: 12, y: 40 },
    ]);
  });

  it("archives, labels, trashes and restores", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
    const due = NOW + 1 + ARCHIVE_GRACE_MS;
    expect(await setArchived(db, a.workspaceId, "p1", true, NOW + 1)).toMatchObject({
      archivedAt: NOW + 1,
      deleteAfter: due,
    });
    // Archiving again keeps the first dates.
    expect(await setArchived(db, a.workspaceId, "p1", true, NOW + 2)).toMatchObject({
      archivedAt: NOW + 1,
      deleteAfter: due,
    });
    expect(await setArchived(db, a.workspaceId, "p1", false, NOW + 3)).toMatchObject({
      archivedAt: null,
      deleteAfter: null,
    });
    // Archived again later: a fresh 30 days from then.
    expect((await setArchived(db, a.workspaceId, "p1", true, NOW + 3))?.deleteAfter).toBe(
      NOW + 3 + ARCHIVE_GRACE_MS,
    );
    expect((await setLabel(db, a.workspaceId, "p1", "Urgent"))?.label).toBe("Urgent");
    expect((await setLabel(db, a.workspaceId, "p1", null))?.label).toBeNull();

    expect(await trashProject(db, a.workspaceId, "p1", NOW + 4)).toBe(true);
    expect(await trashProject(db, a.workspaceId, "p1", NOW + 5)).toBe(false);
    expect(await getProject(db, a.workspaceId, "p1")).toBeNull();
    expect(await listProjects(db, a.workspaceId)).toEqual([]);
    expect(await setLabel(db, a.workspaceId, "p1", "X")).toBeNull();
    expect((await listTrash(db, a.workspaceId)).map((p) => [p.id, p.deletedAt])).toEqual([
      ["p1", NOW + 4],
    ]);

    expect((await restoreProject(db, a.workspaceId, "p1"))?.id).toBe("p1");
    expect(await restoreProject(db, a.workspaceId, "p1")).toBeNull();
    expect(await listTrash(db, a.workspaceId)).toEqual([]);
  });
});
