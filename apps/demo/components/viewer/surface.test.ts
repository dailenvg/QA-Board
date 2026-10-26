import { describe, expect, it } from "vitest";
import type { Comment, Page, Snapshot } from "@/lib/store/types";
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

const page: Page = { id: "p2", blobKey: "page:p2", name: "pricing.png" };
const URL_STAGE = { kind: "url" } as const;
const PAGE_STAGE = { kind: "pages", page } as const;

const comment = (snapshotId?: string, pageId?: string): Comment => ({
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
  ...(pageId ? { pageId } : {}),
});

describe("stageSurface", () => {
  it("shows the live frame in Browse and a snapshot in Comment mode for websites", () => {
    expect(stageSurface(URL_STAGE, "browse", null, latest)).toEqual({ kind: "frame" });
    expect(stageSurface(URL_STAGE, "comment", null, latest)).toEqual({
      kind: "snapshot",
      snapshot: latest,
    });
    expect(stageSurface(URL_STAGE, "comment", older, latest)).toEqual({
      kind: "snapshot",
      snapshot: older,
    });
    expect(surfaceKey(stageSurface(URL_STAGE, "comment", null, null))).toBe("snapshot:none");
  });

  it("shows the page for page projects unless an older snapshot is viewed", () => {
    expect(stageSurface(PAGE_STAGE, "comment", null, latest)).toEqual({ kind: "page", page });
    expect(surfaceKey(stageSurface(PAGE_STAGE, "comment", null, latest))).toBe("page:p2");
    expect(stageSurface(PAGE_STAGE, "browse", older, latest)).toEqual({
      kind: "snapshot",
      snapshot: older,
    });
  });
});

describe("comment placement", () => {
  it("draws legacy website pins on the frame and page pins on their page", () => {
    expect(commentSurfaceKey(comment())).toBe("frame");
    expect(commentSurfaceKey(comment(undefined, "p2"))).toBe("page:p2");
    expect(commentSurfaceKey(comment("new"))).toBe("snapshot:new");
  });

  it("labels legacy, earlier and missing snapshots, but not the latest", () => {
    expect(placementOf(comment(), "url", snapshots, "new")).toEqual({ kind: "live" });
    expect(placementOf(comment(undefined, "p2"), "pages", snapshots, "new")).toBeNull();
    expect(placementOf(comment("new"), "url", snapshots, "new")).toBeNull();
    expect(placementOf(comment("old"), "url", snapshots, "new")).toEqual({
      kind: "earlier",
      at: 1,
    });
    expect(placementOf(comment("new"), "pages", snapshots, "new")).toEqual({
      kind: "earlier",
      at: 2,
    });
    expect(placementOf(comment("gone"), "url", snapshots, "new")).toEqual({ kind: "missing" });
  });

  it("knows how to bring each comment's surface on stage", () => {
    expect(surfaceTargetOf(comment(), "url", snapshots, "new")).toEqual({
      mode: "browse",
      viewedSnapshotId: null,
      pageId: null,
    });
    expect(surfaceTargetOf(comment("new"), "url", snapshots, "new")).toEqual({
      mode: "comment",
      viewedSnapshotId: null,
      pageId: null,
    });
    expect(surfaceTargetOf(comment("old"), "url", snapshots, "new")).toEqual({
      mode: "comment",
      viewedSnapshotId: "old",
      pageId: null,
    });
    expect(surfaceTargetOf(comment("old"), "pages", snapshots, "new")).toEqual({
      mode: null,
      viewedSnapshotId: "old",
      pageId: null,
    });
    expect(surfaceTargetOf(comment(undefined, "p2"), "pages", snapshots, "new")).toEqual({
      mode: null,
      viewedSnapshotId: null,
      pageId: "p2",
    });
    expect(surfaceTargetOf(comment("gone"), "url", snapshots, "new")).toBeNull();
  });
});
