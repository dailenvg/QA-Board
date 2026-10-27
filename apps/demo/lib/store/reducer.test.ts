import { describe, expect, it } from "vitest";
import { LEGACY_V1 } from "@/test/legacy-v1";
import { parseData } from "./persist";
import { reduce, REVOKE_GRACE_MS } from "./reducer";
import {
  previewSnapshot,
  prunableSnapshotIds,
  referencedBlobKeys,
  snapshotsFor,
} from "./snapshots";
import type { Comment, Snapshot, SquintData } from "./types";

function legacy(): SquintData {
  const result = parseData(JSON.stringify(LEGACY_V1));
  if (!result.ok) throw new Error(result.reason);
  return result.data;
}

const snap = (id: string, createdAt: number, projectId = "site", width = 1280): Snapshot => ({
  id,
  projectId,
  width,
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
    const pruned = reduce(data, { type: "snapshot/prune", held: [] });
    expect(snapshotsFor(pruned, "site").map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(reduce(pruned, { type: "snapshot/prune", held: [] })).toBe(pruned);
  });

  it("keeps the latest snapshot of each breakpoint", () => {
    const data = withSnapshots(
      snap("desk-old", 1),
      snap("desk", 2),
      snap("phone", 3, "site", 390),
      snap("tablet-old", 4, "site", 768),
      snap("tablet", 5, "site", 768),
    );
    expect([...prunableSnapshotIds(data)].sort()).toEqual(["desk-old", "tablet-old"]);
  });

  it("keeps the latest snapshot of each page, at each breakpoint", () => {
    const pricing = (id: string, createdAt: number, width = 1280): Snapshot => ({
      ...snap(id, createdAt, "site", width),
      sourceUrl: "https://example.com/pricing#plans",
    });
    const data = withSnapshots(
      snap("home", 1),
      pricing("pricing-old", 2),
      pricing("pricing", 3),
      pricing("pricing-phone", 4, 390),
    );
    expect([...prunableSnapshotIds(data)]).toEqual(["pricing-old"]);
  });

  it("previews a project with its newest desktop snapshot, else its newest one", () => {
    const data = withSnapshots(snap("desk", 1), snap("phone", 2, "site", 390));
    expect(previewSnapshot(data, "site")?.id).toBe("desk");
    const phoneOnly = withSnapshots(snap("phone", 1, "site", 390));
    expect(previewSnapshot(phoneOnly, "site")?.id).toBe("phone");
    expect(previewSnapshot(legacy(), "site")).toBeNull();
  });

  it("previews a project with its own page before other pages", () => {
    const other = { ...snap("other", 2), sourceUrl: "https://example.com/pricing" };
    expect(previewSnapshot(withSnapshots(snap("home", 1), other), "site")?.id).toBe("home");
    expect(previewSnapshot(withSnapshots(other), "site")?.id).toBe("other");
  });

  it("keeps a snapshot whose image a pending Undo holds", () => {
    // "b" lost its only comment; while that delete can be undone, its image is held.
    const data = withSnapshots(snap("a", 1), snap("b", 2), snap("c", 3));
    const pruned = reduce(data, { type: "snapshot/prune", held: ["snapshot:b"] });
    expect(snapshotsFor(pruned, "site").map((entry) => entry.id)).toEqual(["b", "c"]);
    expect([...prunableSnapshotIds(data, new Set(["snapshot:b"]))]).toEqual(["a"]);
  });

  it("deletes and restores a project's snapshots with it", () => {
    const data = withSnapshots(snap("a", 1), snap("b", 2, "mock"));
    const deleted = reduce(data, { type: "project/delete", id: "site", at: 0 });
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
      folder: { id: "second", name: "Second", createdAt: 5, parentId: null },
    });
    data = reduce(data, { type: "folder/delete", id: "default", at: 0 });
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
    const deleted = reduce(data, { type: "project/delete", id: "mock", at: 0 });
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

describe("revoking shares of deleted projects", () => {
  const share = { id: "s1", token: "t", ownerKey: "k", createdAt: 1, cursor: 0 };
  const shared = () => reduce(legacy(), { type: "project/share", id: "site", share });

  it("queues the share when a shared project is deleted, due after the undo window", () => {
    const deleted = reduce(shared(), { type: "project/delete", id: "site", at: 1_000 });
    expect(deleted.revocations).toEqual([
      { shareId: "s1", ownerKey: "k", projectId: "site", dueAt: 1_000 + REVOKE_GRACE_MS },
    ]);
    expect(reduce(legacy(), { type: "project/delete", id: "site", at: 1_000 }).revocations).toEqual(
      [],
    );
  });

  it("cancels it when the delete is undone", () => {
    const before = shared();
    const project = before.projects.find((entry) => entry.id === "site");
    if (!project) throw new Error("fixture");
    const deleted = reduce(before, { type: "project/delete", id: "site", at: 1_000 });
    const restored = reduce(deleted, {
      type: "project/restore",
      project,
      comments: [],
      snapshots: [],
    });
    expect(restored.revocations).toEqual([]);
  });

  it("makes it due at once when the Undo goes away, and forgets it once revoked", () => {
    const deleted = reduce(shared(), { type: "project/delete", id: "site", at: 1_000 });
    const due = reduce(deleted, { type: "revocation/due", projectId: "site", at: 2_000 });
    expect(due.revocations[0]?.dueAt).toBe(2_000);
    expect(reduce(due, { type: "revocation/done", shareId: "s1" }).revocations).toEqual([]);
  });

  it("queues every shared project of a deleted folder, due at once", () => {
    let data = reduce(shared(), {
      type: "folder/create",
      folder: { id: "second", name: "Second", createdAt: 5, parentId: null },
    });
    data = reduce(data, { type: "folder/delete", id: "default", at: 3_000 });
    expect(data.revocations).toEqual([
      { shareId: "s1", ownerKey: "k", projectId: "site", dueAt: 3_000 },
    ]);
  });
});
