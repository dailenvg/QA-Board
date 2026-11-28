import { describe, expect, it } from "vitest";
import { LEGACY_V1 } from "@/test/legacy-v1";
import { parseData } from "./persist";
import { reduce } from "./reducer";
import {
  previewSnapshot,
  prunableSnapshotIds,
  referencedBlobKeys,
  snapshotsFor,
} from "./snapshots";
import type { Comment, Reply, Snapshot, SquintData } from "./types";

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

  it("previews a project with its newest desktop snapshot, else its newest one", () => {
    const data = withSnapshots(snap("desk", 1), snap("phone", 2, "site", 390));
    expect(previewSnapshot(data, "site")?.id).toBe("desk");
    const phoneOnly = withSnapshots(snap("phone", 1, "site", 390));
    expect(previewSnapshot(phoneOnly, "site")?.id).toBe("phone");
    expect(previewSnapshot(legacy(), "site")).toBeNull();
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
      replies: [],
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

  it("sets and clears a comment's priority without marking it edited", () => {
    const must = reduce(legacy(), {
      type: "comment/set-priority",
      id: "c1",
      priority: "must",
      at: 40,
    });
    expect(must.comments.find((entry) => entry.id === "c1")).toMatchObject({
      priority: "must",
      updatedAt: 40,
    });
    expect(must.comments.find((entry) => entry.id === "c1")).not.toHaveProperty("editedAt");
    const nit = reduce(must, { type: "comment/set-priority", id: "c1", priority: "nit", at: 41 });
    expect(nit.comments.find((entry) => entry.id === "c1")?.priority).toBe("nit");
    const cleared = reduce(nit, { type: "comment/set-priority", id: "c1", priority: null, at: 42 });
    expect(cleared.comments.find((entry) => entry.id === "c1")).not.toHaveProperty("priority");
    // The same priority, or a comment that isn't here, changes nothing (so nothing is sent).
    expect(reduce(nit, { type: "comment/set-priority", id: "c1", priority: "nit", at: 43 })).toBe(
      nit,
    );
    expect(
      reduce(cleared, { type: "comment/set-priority", id: "c1", priority: null, at: 44 }),
    ).toBe(cleared);
    expect(
      reduce(nit, { type: "comment/set-priority", id: "gone", priority: "must", at: 45 }),
    ).toBe(nit);
  });

  it("keeps a team comment to the team and back, never a client's, and never marks it edited", () => {
    const hidden = reduce(legacy(), {
      type: "comment/set-team-only",
      id: "c1",
      teamOnly: true,
      at: 40,
    });
    expect(hidden.comments.find((entry) => entry.id === "c1")).toMatchObject({
      teamOnly: true,
      updatedAt: 40,
    });
    expect(hidden.comments.find((entry) => entry.id === "c1")).not.toHaveProperty("editedAt");
    expect(
      reduce(hidden, { type: "comment/set-team-only", id: "c1", teamOnly: true, at: 41 }),
    ).toBe(hidden);
    const shown = reduce(hidden, {
      type: "comment/set-team-only",
      id: "c1",
      teamOnly: false,
      at: 42,
    });
    expect(shown.comments.find((entry) => entry.id === "c1")).not.toHaveProperty("teamOnly");
    const client = {
      ...legacy(),
      comments: legacy().comments.map((entry) => ({ ...entry, fromClient: true as const })),
    };
    expect(
      reduce(client, { type: "comment/set-team-only", id: "c1", teamOnly: true, at: 43 }),
    ).toBe(client);
  });

  it("keeps a new team reply under a team-only comment to the team, never a client's (B2)", () => {
    const hidden = reduce(legacy(), {
      type: "comment/set-team-only",
      id: "c1",
      teamOnly: true,
      at: 40,
    });
    const reply = {
      id: "r1",
      projectId: "site",
      commentId: "c1",
      body: "Hm",
      author: "A",
      createdAt: 41,
    };
    const team = reduce(hidden, { type: "reply/add", reply });
    expect(team.replies[0]).toMatchObject({ id: "r1", teamOnly: true });
    const client = reduce(hidden, { type: "reply/add", reply: { ...reply, fromClient: true } });
    expect(client.replies[0]).not.toHaveProperty("teamOnly");
    // Shown again, the comment leaves the reply written while it was hidden as it is.
    const shown = reduce(team, {
      type: "comment/set-team-only",
      id: "c1",
      teamOnly: false,
      at: 42,
    });
    expect(shown.replies[0]).toMatchObject({ teamOnly: true });
    const replyShown = reduce(shown, { type: "reply/set-team-only", id: "r1", teamOnly: false });
    expect(replyShown.replies[0]).not.toHaveProperty("teamOnly");
  });

  it("marks a comment edited only when its words change", () => {
    const same = reduce(legacy(), { type: "comment/edit", id: "c1", body: "same", at: 50 });
    const body = same.comments.find((entry) => entry.id === "c1")?.body ?? "";
    const unchanged = reduce(same, { type: "comment/edit", id: "c1", body, at: 60 });
    expect(unchanged.comments.find((entry) => entry.id === "c1")).toMatchObject({
      editedAt: 50,
      updatedAt: 60,
    });
    const resolved = reduce(unchanged, {
      type: "comment/set-status",
      id: "c1",
      status: "resolved",
      at: 70,
    });
    expect(resolved.comments.find((entry) => entry.id === "c1")?.editedAt).toBe(50);
    const first = reduce(legacy(), {
      type: "comment/set-status",
      id: "c1",
      status: "resolved",
      at: 9,
    });
    expect(first.comments.find((entry) => entry.id === "c1")).not.toHaveProperty("editedAt");
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
      replies: [],
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
  const share = {
    id: "s",
    token: "t",
    ownerKey: "k",
    createdAt: 1,
    cursor: 0,
    reviewWindowHours: 72,
    reviewEndsAt: 1 + 72 * 3_600_000,
  };
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

  it("sets the link's window from its creation, and no deadline without a limit", () => {
    const week = reduce(shared(), { type: "share/window", id: "site", hours: 168 });
    expect(week.projects.find((p) => p.id === "site")?.share).toMatchObject({
      reviewWindowHours: 168,
      reviewEndsAt: 1 + 168 * 3_600_000,
    });
    const restored = reduce(week, { type: "share/window-restore", id: "site", hours: 24 });
    expect(restored.projects.find((p) => p.id === "site")?.share).toMatchObject({
      reviewWindowHours: 24,
      reviewEndsAt: 1 + 24 * 3_600_000,
    });
    const open = reduce(week, { type: "share/window", id: "site", hours: null });
    expect(open.projects.find((p) => p.id === "site")?.share).toMatchObject({
      reviewWindowHours: null,
      reviewEndsAt: null,
    });
  });

  it("keeps when the link's password was set, and forgets it once removed", () => {
    const locked = reduce(shared(), { type: "share/password", id: "site", passwordSetAt: 40 });
    expect(locked.projects.find((p) => p.id === "site")?.share).toMatchObject({
      passwordSetAt: 40,
    });
    const open = reduce(locked, { type: "share/password", id: "site", passwordSetAt: null });
    expect(open.projects.find((p) => p.id === "site")?.share).not.toHaveProperty("passwordSetAt");
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

  describe("a client's reply pulled from the link", () => {
    const reply = (id: string, commentId: string, projectId = "site"): Reply => ({
      id,
      projectId,
      commentId,
      body: "Thanks!",
      author: "Cleo",
      createdAt: 30,
      fromClient: true,
    });
    const merge = (comments: Comment[], replies: Reply[]) => ({
      type: "share/merge" as const,
      id: "site",
      comments,
      replies,
      snapshots: [],
      cursor: 9,
      at: 60,
    });

    it("lands once, under a comment that's here or merged with it, and touches the project", () => {
      const pulled = merge(
        [{ ...comment("k-1", "x"), fromClient: true }],
        [reply("r-on-team", "c1"), reply("r-on-new", "k-1")],
      );
      const once = reduce(shared(), pulled);
      const twice = reduce(once, pulled);
      expect(twice.replies.map((entry) => entry.id)).toEqual(["r-on-team", "r-on-new"]);
      expect(twice.replies.every((entry) => entry.fromClient)).toBe(true);
      expect(once.projects.find((p) => p.id === "site")?.updatedAt).toBe(60);
    });

    it("never lands under a comment deleted here, nor on another project", () => {
      const deleted = reduce(shared(), { type: "comment/delete", id: "c1" });
      const after = reduce(
        deleted,
        merge([], [reply("r-gone", "c1"), reply("r-elsewhere", "c1", "other")]),
      );
      expect(after.replies).toEqual([]);
      expect(after.projects.find((p) => p.id === "site")?.share?.cursor).toBe(9);
    });
  });

  describe("a client's edit pulled from the link (4.12)", () => {
    const merge = (
      comments: Comment[],
      edits: Array<{ id: string; body: string; editedAt: number }>,
    ) => ({
      type: "share/merge" as const,
      id: "site",
      comments,
      snapshots: [],
      edits,
      cursor: 9,
      at: 60,
    });
    const pulled = () =>
      reduce(shared(), merge([{ ...comment("k-1", "x"), fromClient: true }], []));

    it("changes only the words and when, of a client's comment still here", () => {
      const before = pulled();
      const after = reduce(before, merge([], [{ id: "k-1", body: "Bigger logo", editedAt: 40 }]));
      const was = before.comments.find((entry) => entry.id === "k-1");
      // `updatedAt` moves with it, as on the link, so the next push doesn't send it back.
      expect(after.comments.find((entry) => entry.id === "k-1")).toEqual({
        ...was,
        body: "Bigger logo",
        editedAt: 40,
        updatedAt: 40,
      });
      expect(after.comments.map((entry) => entry.id)).toEqual(before.comments.map((e) => e.id));
    });

    it("never brings back a comment deleted here", () => {
      const deleted = reduce(pulled(), { type: "comment/delete", id: "k-1" });
      const after = reduce(deleted, merge([], [{ id: "k-1", body: "Bigger logo", editedAt: 40 }]));
      expect(after.comments).toEqual(deleted.comments);
    });

    it("leaves the team's comments and older edits alone", () => {
      const edited = reduce(pulled(), merge([], [{ id: "k-1", body: "Newer", editedAt: 50 }]));
      const stale = reduce(
        edited,
        merge(
          [],
          [
            { id: "k-1", body: "Older", editedAt: 40 },
            { id: "c1", body: "Not a client's", editedAt: 40 },
          ],
        ),
      );
      expect(stale.comments).toEqual(edited.comments);
    });
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

describe("replies in the reducer", () => {
  const reply = (id: string, commentId = "c1", projectId = "site"): Reply => ({
    id,
    projectId,
    commentId,
    body: "On it",
    author: "Ana",
    createdAt: 5,
    mine: true,
  });

  /** The legacy data (comments c1 on site, c2 on mock) with replies r1, r2 on c1 and r3 on c2. */
  function threaded(): SquintData {
    return [reply("r1"), reply("r2"), reply("r3", "c2", "mock")].reduce(
      (data, entry) => reduce(data, { type: "reply/add", reply: entry }),
      legacy(),
    );
  }
  const ids = (data: SquintData) => data.replies.map((entry) => entry.id);

  it("adds a reply only under a comment it has, once, leaving the comment and project as they were", () => {
    const data = threaded();
    expect(ids(data)).toEqual(["r1", "r2", "r3"]);
    expect(data.comments).toEqual(legacy().comments);
    expect(data.projects).toEqual(legacy().projects);
    expect(reduce(data, { type: "reply/add", reply: reply("r1") })).toBe(data);
    expect(reduce(data, { type: "reply/add", reply: reply("r9", "gone") })).toBe(data);
    expect(reduce(data, { type: "reply/add", reply: reply("r9", "c1", "mock") })).toBe(data);
  });

  it("marks a reply edited only when its words change", () => {
    const data = threaded();
    expect(reduce(data, { type: "reply/edit", id: "r1", body: "On it", at: 9 })).toBe(data);
    const edited = reduce(data, { type: "reply/edit", id: "r1", body: "Done", at: 9 });
    expect(edited.replies[0]).toMatchObject({ body: "Done", editedAt: 9 });
    expect(reduce(data, { type: "reply/edit", id: "nope", body: "Done", at: 9 })).toBe(data);
  });

  it("deletes a reply, and its Undo puts it back as it was", () => {
    const data = threaded();
    const deleted = reduce(data, { type: "reply/delete", id: "r2" });
    expect(ids(deleted)).toEqual(["r1", "r3"]);
    expect(ids(reduce(data, { type: "reply/removed", id: "r2" }))).toEqual(["r1", "r3"]);
    const restored = reduce(deleted, { type: "reply/restore", reply: reply("r2") });
    expect(restored.replies).toContainEqual(reply("r2"));
    expect(reduce(restored, { type: "reply/restore", reply: reply("r2") })).toBe(restored);
  });

  it("drops a comment's replies with it, deleted or removed, and its Undo brings them back", () => {
    const data = threaded();
    for (const type of ["comment/delete", "comment/removed"] as const) {
      expect(ids(reduce(data, { type, id: "c1" }))).toEqual(["r3"]);
    }
    const comment = data.comments.find((entry) => entry.id === "c1");
    if (!comment) throw new Error("fixture");
    const deleted = reduce(data, { type: "comment/delete", id: "c1" });
    const back = reduce(deleted, {
      type: "comment/restore",
      comment,
      replies: [reply("r1"), reply("r2")],
    });
    expect(ids(back).sort()).toEqual(["r1", "r2", "r3"]);
    expect(ids(reduce(deleted, { type: "comment/restore", comment }))).toEqual(["r3"]);
  });

  it("drops a project's replies with it, in a folder or alone, and its Undo carries them", () => {
    const data = threaded();
    const deleted = reduce(data, { type: "project/delete", id: "site", at: 0 });
    expect(ids(deleted)).toEqual(["r3"]);
    expect(ids(reduce(data, { type: "project/abandon", id: "mock" }))).toEqual(["r1", "r2"]);
    const project = data.projects.find((entry) => entry.id === "site");
    if (!project) throw new Error("fixture");
    const restored = reduce(deleted, {
      type: "project/restore",
      project,
      comments: data.comments.filter((entry) => entry.projectId === "site"),
      replies: data.replies.filter((entry) => entry.projectId === "site"),
      snapshots: [],
    });
    expect(ids(restored).sort()).toEqual(["r1", "r2", "r3"]);
    const other = reduce(data, {
      type: "folder/create",
      folder: { id: "other", name: "Other", createdAt: 1, parentId: null },
    });
    expect(ids(reduce(other, { type: "folder/delete", id: "default", at: 0 }))).toEqual([]);
  });
});
