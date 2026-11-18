import { describe, expect, it } from "vitest";
import { addBlob, addProjectBlob } from "@/test/storage-fixture";
import { addFolder, NOW, seat, twoWorkspaces, URL_PROJECT } from "@/test/workspace-fixture";
import { createProject, trashProject } from "../workspace/projects";
import { loadAdminStorage, TOP_STORAGE_LIMIT } from "./storage";

describe("loadAdminStorage", () => {
  it("totals every workspace and lists the biggest workspaces and projects", async () => {
    const { db, a, b } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await addFolder(db, b.workspaceId);
    for (const id of ["small", "big", "binned"]) {
      await createProject(db, a.workspaceId, URL_PROJECT(id), NOW);
    }
    await createProject(db, b.workspaceId, URL_PROJECT("bravo-one"), NOW);
    await trashProject(db, a.workspaceId, "binned", NOW);
    await addProjectBlob(db, a.workspaceId, "small", "page", "p1", 100);
    await addProjectBlob(db, a.workspaceId, "big", "page", "p1", 4000);
    await addProjectBlob(db, a.workspaceId, "big", "crop", "c1", 1000);
    await addProjectBlob(db, a.workspaceId, "binned", "page", "p1", 700);
    await addBlob(db, a.workspaceId, `ws/${a.workspaceId}/brand/logo/a.png`, 50);
    await addProjectBlob(db, b.workspaceId, "bravo-one", "page", "p1", 9000);
    await seat(db, "empty");

    const storage = await loadAdminStorage(db, NOW);

    expect(storage).toMatchObject({ totalBytes: 14_850, totalFiles: 6, lastRun: null });
    expect(storage.workspaces).toEqual([
      expect.objectContaining({ name: "bravo", usedBytes: 9000, quotaBytes: 5 * 1024 ** 3 }),
      expect.objectContaining({ name: "acme", usedBytes: 5850 }),
    ]);
    expect(storage.workspaces[0]?.ownerEmail).toMatch(/@bravo\.test$/);
    expect(storage.projects).toEqual([
      expect.objectContaining({ id: "bravo-one", workspaceName: "bravo", bytes: 9000, files: 1 }),
      expect.objectContaining({ id: "big", workspaceName: "acme", bytes: 5000, files: 2 }),
      expect.objectContaining({ id: "binned", bytes: 700, trashed: true }),
      expect.objectContaining({ id: "small", bytes: 100, trashed: false }),
    ]);
  });

  it("shows at most the top ten of each, and the latest run", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    for (let index = 0; index < TOP_STORAGE_LIMIT + 2; index += 1) {
      await createProject(db, a.workspaceId, URL_PROJECT(`p${index}`), NOW);
      await addProjectBlob(db, a.workspaceId, `p${index}`, "page", "x", 10 + index);
    }
    for (const at of [NOW - 60_000, NOW - 120_000]) {
      await db.query(
        "INSERT INTO cron_runs (trigger, started_at, finished_at, done, failed) VALUES ('admin', $1, $1, true, false)",
        [new Date(at)],
      );
    }
    const storage = await loadAdminStorage(db, NOW);
    expect(storage.projects).toHaveLength(TOP_STORAGE_LIMIT);
    expect(storage.projects[0]?.id).toBe(`p${TOP_STORAGE_LIMIT + 1}`);
    expect(storage.lastRun).toMatchObject({
      trigger: "admin",
      startedAt: NOW - 60_000,
      status: "finished",
    });
  });

  it("lists nothing while nothing is stored", async () => {
    const { db } = await twoWorkspaces();
    expect(await loadAdminStorage(db, NOW)).toEqual({
      totalBytes: 0,
      totalFiles: 0,
      workspaces: [],
      projects: [],
      lastRun: null,
    });
  });
});
