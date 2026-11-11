import { describe, expect, it } from "vitest";
import { addProjectBlob, storedWorkspace } from "@/test/storage-fixture";
import { addFolder, NOW, twoWorkspaces, URL_PROJECT } from "@/test/workspace-fixture";
import { ARCHIVE_GRACE_MS, TRASH_GRACE_MS } from "../workspace/limits";
import { createProject } from "../workspace/projects";
import { storageReportSchema } from "./schemas";
import { LARGE_PROJECTS_LIMIT, loadStorageReport } from "./storage";

describe("loadStorageReport", () => {
  it("reports usage, the quota, every bucket in order and the projects biggest first", async () => {
    const { db, a, b } = await twoWorkspaces();
    await storedWorkspace(db, a.workspaceId);
    // Another workspace's files never count.
    await addFolder(db, b.workspaceId, "fb");
    await createProject(db, b.workspaceId, URL_PROJECT("other", "fb"), NOW);
    await addProjectBlob(db, b.workspaceId, "other", "snapshot", "s", 999);
    const report = await loadStorageReport(db, a.workspaceId);
    expect(storageReportSchema.parse(report)).toEqual(report);
    expect(report).toEqual({
      usedBytes: 1377,
      quotaBytes: 5 * 1024 ** 3,
      files: 7,
      buckets: [
        { bucket: "images", bytes: 100, files: 1 },
        { bucket: "pdfs", bytes: 900, files: 2 },
        { bucket: "snapshots", bytes: 350, files: 2 },
        { bucket: "crops", bytes: 20, files: 1 },
        { bucket: "videos", bytes: 0, files: 0 },
        { bucket: "other", bytes: 7, files: 1 },
      ],
      largeProjects: [
        {
          id: "deck",
          name: "Deck",
          bytes: 900,
          files: 2,
          status: "archived",
          deleteAfter: NOW + ARCHIVE_GRACE_MS,
        },
        { id: "site", name: "Site", bytes: 320, files: 2, status: "live", deleteAfter: null },
        { id: "shots", name: "Shots", bytes: 100, files: 1, status: "live", deleteAfter: null },
        {
          id: "old",
          name: "Old",
          bytes: 50,
          files: 1,
          status: "trashed",
          deleteAfter: NOW + TRASH_GRACE_MS,
        },
      ],
    });
  });

  it("reports an empty workspace as all zeros, with no projects", async () => {
    const { db, a } = await twoWorkspaces();
    const report = await loadStorageReport(db, a.workspaceId);
    expect(report.usedBytes).toBe(0);
    expect(report.files).toBe(0);
    expect(report.buckets.every((bucket) => bucket.bytes === 0)).toBe(true);
    expect(report.largeProjects).toEqual([]);
  });

  it(`lists ${LARGE_PROJECTS_LIMIT} projects at most, ties by name`, async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    const ids = Array.from(
      { length: LARGE_PROJECTS_LIMIT + 2 },
      (_, index) => `p${String(index).padStart(2, "0")}`,
    );
    // Created last first, so the order comes from the names, not the rows.
    for (const id of [...ids].reverse()) {
      await createProject(db, a.workspaceId, { ...URL_PROJECT(id), name: id }, NOW);
      await addProjectBlob(db, a.workspaceId, id, "snapshot", "s", 10);
    }
    const { largeProjects } = await loadStorageReport(db, a.workspaceId);
    expect(largeProjects.map((project) => project.id)).toEqual(ids.slice(0, LARGE_PROJECTS_LIMIT));
  });
});
