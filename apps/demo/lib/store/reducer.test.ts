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

  it("keeps a deleted project's image referenced again after undo", () => {
    const data = legacy();
    expect(referencedBlobKeys(data).has("image:mock")).toBe(true);
    const deleted = reduce(data, { type: "project/delete", id: "mock" });
    expect(referencedBlobKeys(deleted).has("image:mock")).toBe(false);
    const project = data.projects.find((entry) => entry.id === "mock");
    if (!project) throw new Error("fixture");
    const restored = reduce(deleted, {
      type: "project/restore",
      project,
      comments: [],
      snapshots: [],
    });
    expect(referencedBlobKeys(restored).has("image:mock")).toBe(true);
  });

  it("lists every blob the data points at", () => {
    let data = withSnapshots(snap("a", 1));
    data = reduce(data, {
      type: "comment/set-crop",
      id: "c1",
      crop: { blobKey: "crop:c1", rect: { x: 0, y: 0, width: 1, height: 1 } },
    });
    expect([...referencedBlobKeys(data)].sort()).toEqual(["crop:c1", "image:mock", "snapshot:a"]);
  });
});

describe("sharing in the reducer", () => {
  const share = { id: "s", token: "t", ownerKey: "k", createdAt: 1, cursor: 0 };
  const shared = () => reduce(legacy(), { type: "project/share", id: "site", share });

  it("merges pulled client comments once, advancing the cursor", () => {
    const merge = {
      type: "share/merge" as const,
      id: "site",
      comments: [comment("k-1", "snap")],
      snapshots: [snap("snap", 5)],
      cursor: 7,
      at: 50,
    };
    const once = reduce(shared(), merge);
    const twice = reduce(once, merge);
    expect(twice.comments.filter((entry) => entry.id === "k-1")).toHaveLength(1);
    expect(twice.snapshots.filter((entry) => entry.id === "snap")).toHaveLength(1);
    expect(twice.projects.find((p) => p.id === "site")?.share).toMatchObject({
      cursor: 7,
      lastSyncedAt: 50,
    });
  });

  it("keeps the owner's copy of a comment it already has", () => {
    const data = reduce(shared(), {
      type: "share/merge",
      id: "site",
      comments: [{ ...comment("c1", "x"), body: "Changed" }],
      snapshots: [],
      cursor: 3,
      at: 50,
    });
    expect(data.comments.find((entry) => entry.id === "c1")?.body).toBe(LEGACY_V1.comments[0].body);
  });

  it("ignores merges for projects that aren't shared, and forgets a share on unshare", () => {
    const merge = {
      type: "share/merge" as const,
      id: "site",
      comments: [comment("k-1", "x")],
      snapshots: [],
      cursor: 1,
      at: 1,
    };
    expect(reduce(legacy(), merge)).toEqual(legacy());
    const unshared = reduce(shared(), { type: "project/unshare", id: "site" });
    expect(unshared.projects.find((p) => p.id === "site")).not.toHaveProperty("share");
  });
});
