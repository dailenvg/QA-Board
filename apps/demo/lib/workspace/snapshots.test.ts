import { describe, expect, it } from "vitest";
import { addFolder, NOW, twoWorkspaces, URL_PROJECT } from "@/test/workspace-fixture";
import { addComment, listComments } from "./comments";
import { createProject, trashProject } from "./projects";
import { addSnapshot, deleteSnapshot, listSnapshots } from "./snapshots";

const SNAPSHOT = {
  id: "s1",
  width: 1280,
  height: 4000,
  createdAt: NOW,
  blobKey: "snapshot:s1",
  sourceUrl: "https://acme.example/",
  scale: 0.5,
};

describe("snapshots", () => {
  it("adds, lists and deletes snapshots (with their comments), never replacing one", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
    expect(await addSnapshot(db, a.workspaceId, "p1", SNAPSHOT)).toEqual({
      ok: true,
      value: { ...SNAPSHOT, projectId: "p1" },
    });
    expect(await addSnapshot(db, a.workspaceId, "p1", { ...SNAPSHOT, width: 1 })).toEqual({
      ok: false,
      reason: "exists",
    });
    const full = await addSnapshot(db, a.workspaceId, "p1", {
      ...SNAPSHOT,
      id: "s2",
      scale: undefined,
    });
    expect(full.ok && full.value).not.toHaveProperty("scale");
    await addComment(
      db,
      a.workspaceId,
      "p1",
      { id: "c1", x: 1, y: 1, body: "Hi", author: "Ana", status: "active", snapshotId: "s1" },
      a.userId,
      NOW,
    );
    expect((await listSnapshots(db, a.workspaceId, "p1")).map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(await deleteSnapshot(db, a.workspaceId, "p1", "s1")).toBe(true);
    expect(await deleteSnapshot(db, a.workspaceId, "p1", "s1")).toBe(false);
    expect(await listComments(db, a.workspaceId, "p1")).toEqual([]);
  });

  it("hides a trashed project's snapshots and refuses new ones", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
    await addSnapshot(db, a.workspaceId, "p1", SNAPSHOT);
    await trashProject(db, a.workspaceId, "p1", NOW);
    expect(await listSnapshots(db, a.workspaceId)).toEqual([]);
    expect((await addSnapshot(db, a.workspaceId, "p1", { ...SNAPSHOT, id: "s2" })).ok).toBe(false);
    expect(await deleteSnapshot(db, a.workspaceId, "p1", "s1")).toBe(false);
  });
});
