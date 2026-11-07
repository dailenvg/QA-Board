import { describe, expect, it } from "vitest";
import { addFolder, NOW, twoWorkspaces, URL_PROJECT } from "@/test/workspace-fixture";
import { createFolder, deleteFolder, listFolders, projectsInFolder, updateFolder } from "./folders";
import { createProject, trashProject } from "./projects";

describe("folders", () => {
  it("creates folders, never replacing one, and lists them oldest first", async () => {
    const { db, a } = await twoWorkspaces();
    const created = await createFolder(
      db,
      a.workspaceId,
      { id: "f1", name: "Clients", parentId: null },
      NOW,
    );
    expect(created).toEqual({
      ok: true,
      value: { id: "f1", name: "Clients", parentId: null, createdAt: NOW },
    });
    expect(
      await createFolder(db, a.workspaceId, { id: "f1", name: "Again", parentId: null }, NOW),
    ).toEqual({ ok: false, reason: "exists" });
    expect(
      await createFolder(db, a.workspaceId, { id: "f2", name: "Sub", parentId: "nope" }, NOW),
    ).toEqual({ ok: false, reason: "unknown-parent" });
    await createFolder(db, a.workspaceId, { id: "f2", name: "Sub", parentId: "f1" }, NOW + 1);
    expect((await listFolders(db, a.workspaceId)).map((folder) => folder.id)).toEqual(["f1", "f2"]);
  });

  it("renames and moves a folder, but never into itself or its own subfolder", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId, "top");
    await addFolder(db, a.workspaceId, "mid", "top");
    await addFolder(db, a.workspaceId, "leaf", "mid");
    expect(await updateFolder(db, a.workspaceId, "top", { parentId: "leaf" })).toEqual({
      ok: false,
      reason: "cycle",
    });
    expect(await updateFolder(db, a.workspaceId, "top", { parentId: "top" })).toEqual({
      ok: false,
      reason: "cycle",
    });
    const moved = await updateFolder(db, a.workspaceId, "leaf", { name: "Leaf", parentId: null });
    expect(moved.ok && moved.value).toMatchObject({ id: "leaf", name: "Leaf", parentId: null });
    const renamed = await updateFolder(db, a.workspaceId, "mid", { name: "Middle" });
    expect(renamed.ok && renamed.value).toMatchObject({ name: "Middle", parentId: "top" });
    expect(await updateFolder(db, a.workspaceId, "nope", { name: "X" })).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("deletes a folder tree only once no live project is left in it", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId, "top");
    await addFolder(db, a.workspaceId, "sub", "top");
    await createProject(db, a.workspaceId, URL_PROJECT("p1", "sub"), NOW);
    expect(await deleteFolder(db, a.workspaceId, "top")).toEqual({
      ok: false,
      reason: "not-empty",
    });
    await trashProject(db, a.workspaceId, "p1", NOW);
    expect(await projectsInFolder(db, a.workspaceId, "top")).toEqual([{ id: "p1", trashed: true }]);
    // The route purges trashed projects first; the query alone still refuses.
    expect(await deleteFolder(db, a.workspaceId, "top")).toEqual({
      ok: false,
      reason: "not-empty",
    });
    await db.query("DELETE FROM projects WHERE id = 'p1'");
    expect(await deleteFolder(db, a.workspaceId, "top")).toEqual({ ok: true, value: null });
    expect(await listFolders(db, a.workspaceId)).toEqual([]);
    expect(await deleteFolder(db, a.workspaceId, "top")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});
