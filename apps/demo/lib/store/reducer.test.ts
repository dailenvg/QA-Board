import { describe, expect, it } from "vitest";
import { LEGACY_V1 } from "@/test/legacy-v1";
import { parseData } from "./persist";
import { reduce } from "./reducer";
import { prunableSnapshotIds, referencedBlobKeys, snapshotsFor } from "./snapshots";
import type { Comment, Snapshot, SquintData } from "./types";

function legacy(): SquintData {
  const result = parseData(JSON.stringify(LEGACY_V1));
  if (!result.ok) throw new Error(result.reason);
  return result.data;
}

const snap = (id: string, createdAt: number, projectId = "site"): Snapshot => ({
  id,
  projectId,
  width: 1280,
  height: 3000,
  createdAt,
  blobKey: `snapshot:${id}`,
  sourceUrl: "https://example.com/",
});

const comment = (id: string, snapshotId: string): Comment => ({
  id,
  projectId: "site",
  x: 10,
  y: 10,
  body: "Note",
  author: "Ana",
  status: "active",
  createdAt: 2,
  updatedAt: 2,
  snapshotId,
});

function withSnapshots(...snapshots: Snapshot[]): SquintData {
  return snapshots.reduce(
    (data, snapshot) => reduce(data, { type: "snapshot/add", snapshot }),
    legacy(),
  );
}

describe("snapshots in the reducer", () => {
  it("adds a snapshot only to an existing project, once", () => {
    const data = withSnapshots(snap("a", 1));
    expect(data.snapshots).toHaveLength(1);
    expect(reduce(data, { type: "snapshot/add", snapshot: snap("a", 1) })).toBe(data);
    expect(reduce(data, { type: "snapshot/add", snapshot: snap("x", 1, "gone") })).toBe(data);
  });

  it("prunes replaced snapshots nobody commented on, keeping the latest", () => {
    let data = withSnapshots(snap("a", 1), snap("b", 2), snap("c", 3));
    data = reduce(data, { type: "comment/add", comment: comment("on-a", "a") });
    expect([...prunableSnapshotIds(data)]).toEqual(["b"]);
    const pruned = reduce(data, { type: "snapshot/prune" });
    expect(snapshotsFor(pruned, "site").map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(reduce(pruned, { type: "snapshot/prune" })).toBe(pruned);
  });

  it("deletes and restores a project's snapshots with it", () => {
    const data = withSnapshots(snap("a", 1), snap("b", 2, "mock"));
    const deleted = reduce(data, { type: "project/delete", id: "site" });
    expect(deleted.snapshots.map((entry) => entry.id)).toEqual(["b"]);
    const project = data.projects.find((entry) => entry.id === "site");
    if (!project) throw new Error("fixture");
    const restored = reduce(deleted, {
      type: "project/restore",
      project,
      comments: data.comments.filter((entry) => entry.projectId === "site"),
      snapshots: data.snapshots.filter((entry) => entry.projectId === "site"),
    });
    expect(snapshotsFor(restored, "site").map((entry) => entry.id)).toEqual(["a"]);
  });

  it("removes snapshots of projects in a deleted folder", () => {
    let data = reduce(withSnapshots(snap("a", 1)), {
      type: "folder/create",
      folder: { id: "second", name: "Second", createdAt: 5 },
    });
    data = reduce(data, { type: "folder/delete", id: "default" });
    expect(data.snapshots).toEqual([]);
  });

  it("attaches a crop without marking the comment edited", () => {
    const crop = { blobKey: "crop:c1", rect: { x: 0, y: 0, width: 10, height: 10 } };
    const data = reduce(legacy(), { type: "comment/set-crop", id: "c1", crop });
    const updated = data.comments.find((entry) => entry.id === "c1");
    expect(updated?.crop).toEqual(crop);
    expect(updated?.updatedAt).toBe(updated?.createdAt);
    expect(data.projects).toEqual(legacy().projects);
    expect(reduce(data, { type: "comment/set-crop", id: "gone", crop })).toBe(data);
  });

  it("lists every blob the data points at", () => {
    let data = withSnapshots(snap("a", 1));
    data = reduce(data, {
      type: "comment/set-crop",
      id: "c1",
      crop: { blobKey: "crop:c1", rect: { x: 0, y: 0, width: 1, height: 1 } },
    });
    expect([...referencedBlobKeys(data)].sort()).toEqual(["crop:c1", "snapshot:a"]);
  });
});
