import { describe, expect, it } from "vitest";
import type { Comment, Snapshot } from "@/lib/store/types";
import {
  commentSurfaceKey,
  placementOf,
  stageSurface,
  surfaceKey,
  surfaceTargetOf,
} from "./surface";

const snapshot = (id: string, createdAt: number): Snapshot => ({
  id,
  projectId: "p",
  width: 1280,
  height: 3000,
  createdAt,
  blobKey: `snapshot:${id}`,
  sourceUrl: "https://example.com/",
});

const older = snapshot("old", 1);
const latest = snapshot("new", 2);
const snapshots = new Map([
  [older.id, older],
  [latest.id, latest],
]);

const comment = (snapshotId?: string): Comment => ({
  id: "c",
  projectId: "p",
  x: 1,
  y: 1,
  body: "b",
  author: "a",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
  ...(snapshotId ? { snapshotId } : {}),
});

describe("stageSurface", () => {
  it("shows the live frame in Browse and a snapshot in Comment mode for websites", () => {
    expect(stageSurface("url", "browse", null, latest)).toEqual({ kind: "frame" });
    expect(stageSurface("url", "comment", null, latest)).toEqual({
      kind: "snapshot",
      snapshot: latest,
    });
    expect(stageSurface("url", "comment", older, latest)).toEqual({
      kind: "snapshot",
      snapshot: older,
    });
    expect(surfaceKey(stageSurface("url", "comment", null, null))).toBe("snapshot:none");
  });

  it("shows the image for image projects unless an older snapshot is viewed", () => {
    expect(stageSurface("image", "comment", null, latest)).toEqual({ kind: "image" });
    expect(stageSurface("image", "browse", older, latest)).toEqual({
      kind: "snapshot",
      snapshot: older,
    });
  });
});

describe("comment placement", () => {
  it("draws legacy website pins on the frame and image pins on the image", () => {
    expect(commentSurfaceKey(comment(), "url")).toBe("frame");
    expect(commentSurfaceKey(comment(), "image")).toBe("image");
    expect(commentSurfaceKey(comment("new"), "url")).toBe("snapshot:new");
  });

  it("labels legacy, earlier and missing snapshots, but not the latest", () => {
    expect(placementOf(comment(), "url", snapshots, "new")).toEqual({ kind: "live" });
    expect(placementOf(comment(), "image", snapshots, "new")).toBeNull();
    expect(placementOf(comment("new"), "url", snapshots, "new")).toBeNull();
    expect(placementOf(comment("old"), "url", snapshots, "new")).toEqual({
      kind: "earlier",
      at: 1,
    });
    expect(placementOf(comment("new"), "image", snapshots, "new")).toEqual({
      kind: "earlier",
      at: 2,
    });
    expect(placementOf(comment("gone"), "url", snapshots, "new")).toEqual({ kind: "missing" });
  });

  it("knows how to bring each comment's surface on stage", () => {
    expect(surfaceTargetOf(comment(), "url", snapshots, "new")).toEqual({
      mode: "browse",
      viewedSnapshotId: null,
    });
    expect(surfaceTargetOf(comment("new"), "url", snapshots, "new")).toEqual({
      mode: "comment",
      viewedSnapshotId: null,
    });
    expect(surfaceTargetOf(comment("old"), "url", snapshots, "new")).toEqual({
      mode: "comment",
      viewedSnapshotId: "old",
    });
    expect(surfaceTargetOf(comment("old"), "image", snapshots, "new")).toEqual({
      mode: null,
      viewedSnapshotId: "old",
    });
    expect(surfaceTargetOf(comment("gone"), "url", snapshots, "new")).toBeNull();
  });
});
